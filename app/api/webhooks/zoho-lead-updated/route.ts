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

interface ZohoLeadUpdatedPayload {
  lead_id?: string | number;
  modified_time?: string;
  Portal_Unlocks?: unknown;
  Owner?: {
    email?: string;
    id?: string;
  };
}

// In-memory dedup. Zoho occasionally fires twice for the same edit
// (Workflow Rule retry, browser auto-save). Keyed by lead_id +
// modified_time so a *legitimate* re-edit (different modified_time)
// still flows through. TTL deliberately short — long enough to cover
// Zoho's retry window, short enough to not gum up the next real edit.
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

  let payload: ZohoLeadUpdatedPayload;
  try {
    payload = JSON.parse(rawBody) as ZohoLeadUpdatedPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadIdRaw = payload.lead_id;
  const leadId =
    typeof leadIdRaw === "string"
      ? leadIdRaw
      : typeof leadIdRaw === "number"
        ? String(leadIdRaw)
        : null;
  const modifiedTime =
    typeof payload.modified_time === "string" ? payload.modified_time : null;

  if (!leadId || !modifiedTime) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id and modified_time" },
      { status: 400 },
    );
  }

  // Dedup. The Map grows unbounded in pathological scenarios, so prune
  // expired entries on every call. At Zoho's edit rate, this stays tiny.
  const now = Date.now();
  pruneDedup(now);
  const dedupKey = `${leadId}-${modifiedTime}`;
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
    // Locate the candidate by zoho_lead_id on bmave-core.candidates.
    // The portal session row joins to this via candidate_id.
    const { data: candidate, error: lookupErr } = await core
      .from("candidates")
      .select("id, assigned_rep_id")
      .eq("zoho_lead_id", leadId)
      .maybeSingle();

    if (lookupErr) {
      const message = `candidate lookup failed: ${lookupErr.message}`;
      await finalize("failed", null, message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (!candidate) {
      await finalize("noop", null, "no_candidate_for_lead_id");
      return NextResponse.json({
        ok: false,
        reason: "no_candidate_for_lead_id",
      });
    }

    const candidateId = candidate.id as string;
    const currentRepId = (candidate.assigned_rep_id as string | null) ?? null;
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
