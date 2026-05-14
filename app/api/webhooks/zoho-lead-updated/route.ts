import "server-only";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createCoreClient } from "@/lib/core-client";
import { createAppServiceClient } from "@/lib/supabase-app";
import { isValidUnlockKey } from "@/lib/unlock-keys";
import { lookupRepByEmail } from "@/lib/rep-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single Zoho Workflow Rule fires this endpoint on every Lead edit.
// Two responsibilities folded into one webhook so a single Zoho rule
// covers both concerns:
//
//   1) Unlock sync — mirror `Portal_Unlocks` multi-select picklist into
//      candidates_in_portal.unlocked_keys (text[]). Full-replace, not
//      append, so removing a value in Zoho propagates as a revocation.
//      The waiting renderer subscribes to candidates_in_portal via
//      Supabase realtime and transitions to its unlocked state when the
//      array gains the matching key.
//
//   2) Rep reassignment freshness — when the Lead's Owner changes,
//      re-resolve to bmave-core.reps and update assigned_rep_id on the
//      cross-project candidate row. Closes backlog item #5 from PR #96,
//      where rep edits in Zoho didn't propagate without a manual seed.

// Payload is module-agnostic from the Deluge side — the same custom
// function will eventually serve Contacts and Deals workflow rules
// too. `record_id` is the Zoho record's ID (Lead.Lead Id today),
// `module` names which CRM module the record lives in. The route URL
// stays /api/webhooks/zoho-lead-updated for historical reasons; the
// implementation is module-aware via the dispatcher below.
interface ZohoRecordUpdatedPayload {
  record_id?: string | number;
  module?: string;
  modified_time?: string;
  Portal_Unlocks?: unknown;
  Owner?: {
    email?: string;
    id?: string;
  };
}

// In-memory dedup. Zoho occasionally fires twice for the same edit
// (Workflow Rule retry, browser auto-save). Keyed by module +
// record_id + modified_time so a Lead and a Contact with the same
// numeric ID can't collide once the Contacts path comes online. A
// *legitimate* re-edit (different modified_time) still flows through.
// TTL deliberately short — long enough to cover Zoho's retry window,
// short enough to not gum up the next real edit.
const recentlyProcessed = new Map<string, number>();
const DEDUP_TTL_MS = 30_000;

function pruneDedup(now: number) {
  for (const [key, ts] of recentlyProcessed) {
    if (now - ts > DEDUP_TTL_MS) {
      recentlyProcessed.delete(key);
    }
  }
}

// HMAC body verification — same shape as zoho-lead-created. Tries hex
// then base64 since Zoho's Deluge runtime emits base64 and manual /
// Make.com signatures often arrive as hex.
function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  try {
    const provided = Buffer.from(header, "hex");
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  } catch {}
  try {
    const provided = Buffer.from(header, "base64");
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  } catch {}
  return false;
}

// Dispatch the Zoho record to the right column on bmave-core.candidates.
// The webhook URL is /api/webhooks/zoho-lead-updated for historical
// reasons but the Deluge function calling it is module-agnostic — the
// payload's `module` field tells us where to look. Returns a tagged
// result so the route handler can render the right HTTP response
// without needing a try/catch for the not-implemented branch.
type CoreClient = ReturnType<typeof createCoreClient>;
type CandidateRow = { id: string; assigned_rep_id: string | null };
type FindResult =
  | { status: "ok"; candidate: CandidateRow }
  | { status: "not_found" }
  | { status: "not_implemented"; module: string }
  | { status: "error"; message: string };

async function findCandidateByZohoRecord(
  recordId: string,
  moduleName: string,
  core: CoreClient,
): Promise<FindResult> {
  // Dispatcher in place for all three modules. Contacts and Deals
  // already have matching columns on bmave-core.candidates
  // (zoho_contact_id / zoho_deal_id), but the upstream Zoho
  // automations that would fire those webhooks don't exist yet, so we
  // short-circuit to not_implemented to avoid silently surfacing
  // partial behavior. When those flows come online, swap the early
  // returns for the corresponding column constants and the SELECT
  // below will run for all three.
  let column: "zoho_lead_id";
  switch (moduleName) {
    case "Leads":
      column = "zoho_lead_id";
      break;
    case "Contacts":
    case "Deals":
      return { status: "not_implemented", module: moduleName };
    default:
      return { status: "not_implemented", module: moduleName };
  }

  const { data, error } = await core
    .from("candidates")
    .select("id, assigned_rep_id")
    .eq(column, recordId)
    .maybeSingle();
  if (error) {
    return { status: "error", message: error.message };
  }
  if (!data) {
    return { status: "not_found" };
  }
  return {
    status: "ok",
    candidate: {
      id: data.id as string,
      assigned_rep_id: (data.assigned_rep_id as string | null) ?? null,
    },
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  // Order-independent compare — Zoho's multi-select payload doesn't
  // guarantee stable ordering across edits, and the renderer only
  // cares about set membership.
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

export async function POST(request: Request) {
  const secret = process.env.ZOHO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[zoho-lead-updated] missing ZOHO_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-zoho-webhook-signature");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ZohoRecordUpdatedPayload;
  try {
    payload = JSON.parse(rawBody) as ZohoRecordUpdatedPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const recordIdRaw = payload.record_id;
  const recordId =
    typeof recordIdRaw === "string"
      ? recordIdRaw
      : typeof recordIdRaw === "number"
        ? String(recordIdRaw)
        : null;
  // Default to "Leads" so old workflow-rule payloads that haven't been
  // updated to send `module` still land in the right dispatcher branch
  // during the rollout window.
  const moduleName: string =
    typeof payload.module === "string" && payload.module.trim().length > 0
      ? payload.module.trim()
      : "Leads";
  const modifiedTime =
    typeof payload.modified_time === "string" ? payload.modified_time : null;

  if (!recordId || !modifiedTime) {
    return NextResponse.json(
      { error: "Missing required fields: record_id and modified_time" },
      { status: 400 },
    );
  }

  // Dedup. The Map grows unbounded in pathological scenarios, so prune
  // expired entries on every call. At Zoho's edit rate, this stays tiny.
  // Module-scoped so Lead 123 and Contact 123 can't collide.
  const now = Date.now();
  pruneDedup(now);
  const dedupKey = `${moduleName}-${recordId}-${modifiedTime}`;
  if (recentlyProcessed.has(dedupKey)) {
    return NextResponse.json({ ok: true, dedup: true });
  }
  recentlyProcessed.set(dedupKey, now);

  const app = createAppServiceClient();
  const core = createCoreClient();

  // Log to webhook_events for the audit trail (same pattern as
  // zoho-lead-created). Best-effort; logging failure shouldn't block.
  let eventId: string | null = null;
  {
    const { data, error } = await app
      .from("webhook_events")
      .insert({
        event_type: "zoho_lead_updated",
        source: "zoho",
        payload: payload as unknown as Record<string, unknown>,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[zoho-lead-updated] webhook_events insert failed", error);
    } else {
      eventId = data.id;
    }
  }

  const finalize = async (
    status: "success" | "failed" | "noop",
    candidateId: string | null,
    errorMessage: string | null,
  ) => {
    if (!eventId) return;
    await app
      .from("webhook_events")
      .update({
        status,
        candidate_id: candidateId,
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);
  };

  try {
    // Module-aware candidate lookup. Today this only resolves Leads;
    // Contacts and Deals return not_implemented so callers know the
    // dispatcher path exists but isn't wired yet.
    const lookup = await findCandidateByZohoRecord(recordId, moduleName, core);

    if (lookup.status === "not_implemented") {
      await finalize("noop", null, `module_not_implemented:${lookup.module}`);
      return NextResponse.json(
        { ok: false, reason: "not_implemented", module: lookup.module },
        { status: 501 },
      );
    }
    if (lookup.status === "error") {
      const message = `candidate lookup failed: ${lookup.message}`;
      await finalize("failed", null, message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (lookup.status === "not_found") {
      await finalize("noop", null, `no_candidate_for_${moduleName.toLowerCase()}_record`);
      return NextResponse.json({
        ok: false,
        reason: "no_candidate_for_record",
        module: moduleName,
      });
    }

    const candidateId = lookup.candidate.id;
    const currentRepId = lookup.candidate.assigned_rep_id;
    const updatesApplied: string[] = [];

    // ---- 1) Unlock sync ----
    //
    // Zoho's multi-select arrives as an array of strings (or null/empty
    // when nothing's set). Defensively filter to known unlock keys so
    // a typo in Zoho (e.g. "webniar_unlocked") doesn't poison the
    // candidate's array. Full-replace so removals propagate.
    let incomingUnlocks: string[] = [];
    const portalUnlocksRaw = payload.Portal_Unlocks;
    if (Array.isArray(portalUnlocksRaw)) {
      incomingUnlocks = portalUnlocksRaw
        .filter((k): k is string => typeof k === "string")
        .filter(isValidUnlockKey);
    } else if (typeof portalUnlocksRaw === "string") {
      // Some Zoho configurations send a delimited string for
      // multi-selects instead of an array. Split on common delimiters
      // and dedupe — covers ";", ",", and the rare newline-separated
      // case we've seen in legacy automations.
      incomingUnlocks = portalUnlocksRaw
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(isValidUnlockKey);
    }
    const uniqueIncoming = Array.from(new Set(incomingUnlocks));

    // Fetch current unlocked_keys via the portal session row.
    const { data: portalRow, error: portalErr } = await app
      .from("candidates_in_portal")
      .select("id, unlocked_keys")
      .eq("candidate_id", candidateId)
      .maybeSingle();

    if (portalErr) {
      console.warn(
        `[zoho-lead-updated] portal lookup failed for ${candidateId}: ${portalErr.message}`,
      );
    }

    if (portalRow) {
      const currentUnlocks = Array.isArray(portalRow.unlocked_keys)
        ? (portalRow.unlocked_keys as string[])
        : [];
      if (!arraysEqual(currentUnlocks, uniqueIncoming)) {
        const { error: unlockErr } = await app
          .from("candidates_in_portal")
          .update({ unlocked_keys: uniqueIncoming })
          .eq("id", portalRow.id as string);
        if (unlockErr) {
          // Non-fatal — log and continue with rep reassignment. A
          // failed unlock write just means the candidate's waiting
          // card doesn't transition until the next Zoho edit retries.
          console.warn(
            `[zoho-lead-updated] unlocked_keys update failed for ${candidateId}: ${unlockErr.message}`,
          );
        } else {
          updatesApplied.push("unlocked_keys");
        }
      }
    }

    // ---- 2) Rep reassignment ----
    const ownerEmail = payload.Owner?.email?.trim() || null;
    const ownerZohoUserId = payload.Owner?.id?.trim() || null;
    if (ownerEmail) {
      const repId = await lookupRepByEmail(ownerEmail, core, {
        zohoUserId: ownerZohoUserId,
      });
      if (repId && repId !== currentRepId) {
        const { error: repErr } = await core
          .from("candidates")
          .update({ assigned_rep_id: repId })
          .eq("id", candidateId);
        if (repErr) {
          console.warn(
            `[zoho-lead-updated] assigned_rep_id update failed for ${candidateId}: ${repErr.message}`,
          );
        } else {
          updatesApplied.push("assigned_rep_id");
        }
      }
    }

    await finalize(
      updatesApplied.length > 0 ? "success" : "noop",
      candidateId,
      updatesApplied.length > 0 ? `updates: ${updatesApplied.join(",")}` : null,
    );

    return NextResponse.json({
      ok: true,
      candidate_id: candidateId,
      updates: updatesApplied,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[zoho-lead-updated] unhandled error", err);
    await finalize("failed", null, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
