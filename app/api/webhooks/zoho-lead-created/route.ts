import "server-only";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createCoreClient } from "@/lib/core-client";
import { createAppServiceClient } from "@/lib/supabase-app";
import { getBrandFromParseId } from "@/lib/brand-from-parseid";
import { generateToken } from "@/lib/generate-token";
import { zohoApi } from "@/lib/zoho-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inbound payload shape — Zoho workflow webhooks send the field names
// exactly as they appear on the Lead module (capitalized + underscore).
// All fields optional at the type level; we validate required ones at
// runtime and return 400 with details if anything is missing.
interface ZohoLeadPayload {
  Lead_ID?: string;
  First_Name?: string;
  Last_Name?: string;
  Email?: string;
  Phone?: string;
  Zip_Code?: string;
  ParseID?: string;
}

const PORTAL_HOST_BY_BRAND_SLUG: Record<string, string> = {
  "hounds-town-usa": "houndstowndiscovery.bmave.com",
  "cruisin-tikis": "cruisintikisdiscovery.bmave.com",
};

// Zoho Deluge's zoho.encryption.hmacSha256 returns base64; manually-built
// signatures (Make.com, Postman) often send hex. Try both encodings so the
// webhook works no matter which side generates the signature.
function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();

  try {
    const providedBuf = Buffer.from(header, "hex");
    if (providedBuf.length === expected.length && timingSafeEqual(providedBuf, expected)) {
      return true;
    }
  } catch {}

  try {
    const providedBuf = Buffer.from(header, "base64");
    if (providedBuf.length === expected.length && timingSafeEqual(providedBuf, expected)) {
      return true;
    }
  } catch {}

  return false;
}

export async function POST(request: Request) {
  const secret = process.env.ZOHO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[zoho-lead-created] missing ZOHO_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // HMAC must be verified against the *raw* body, not the parsed JSON,
  // so we read text first and JSON.parse after.
  const rawBody = await request.text();
  const signature = request.headers.get("x-zoho-webhook-signature");

  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: ZohoLeadPayload;
  try {
    payload = JSON.parse(rawBody) as ZohoLeadPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { Lead_ID, First_Name, Last_Name, Email, Phone, Zip_Code, ParseID } = payload;

  const missing: string[] = [];
  if (!Lead_ID) missing.push("Lead_ID");
  if (!Email) missing.push("Email");
  if (!ParseID) missing.push("ParseID");
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required fields", missing },
      { status: 400 },
    );
  }

  const brand = getBrandFromParseId(ParseID);
  if (!brand) {
    return NextResponse.json(
      { error: `Unknown ParseID: ${ParseID}` },
      { status: 400 },
    );
  }

  const portalHost = PORTAL_HOST_BY_BRAND_SLUG[brand.brandSlug];
  if (!portalHost) {
    return NextResponse.json(
      { error: `No portal host configured for brand: ${brand.brandSlug}` },
      { status: 500 },
    );
  }

  const app = createAppServiceClient();
  const core = createCoreClient();

  // Log first so we have a trail even if processing crashes mid-way.
  // Best-effort: a logging failure shouldn't block the webhook.
  let eventId: string | null = null;
  {
    const { data, error } = await app
      .from("webhook_events")
      .insert({
        event_type: "zoho_lead_created",
        source: "zoho",
        payload: payload as unknown as Record<string, unknown>,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[zoho-lead-created] webhook_events insert failed", error);
    } else {
      eventId = data.id;
    }
  }

  const finalize = async (
    status: "success" | "failed" | "partial",
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
    // Idempotency: a webhook retry (or workflow re-fire) shows up here
    // with the same Lead_ID. Match on zoho_lead_id first; if we already
    // have that candidate, fetch their existing portal token and return.
    const { data: existingByLead } = await core
      .from("candidates")
      .select("id")
      .eq("zoho_lead_id", Lead_ID)
      .maybeSingle();

    if (existingByLead?.id) {
      const { data: portalRow } = await app
        .from("candidates_in_portal")
        .select("token")
        .eq("candidate_id", existingByLead.id)
        .maybeSingle();

      if (portalRow?.token) {
        const portalUrl = `https://${portalHost}/portal/${portalRow.token}`;
        await finalize("success", existingByLead.id, null);
        return NextResponse.json({
          success: true,
          candidate_id: existingByLead.id,
          portal_token: portalRow.token,
          portal_url: portalUrl,
          idempotent: true,
        });
      }
      // Candidate exists but no portal row — fall through to create one.
    }

    // Upsert by email so a previously-seeded or hand-created candidate
    // with the same address gets enriched in place rather than colliding
    // on the unique(email) constraint.
    const { data: candidate, error: candidateErr } = await core
      .from("candidates")
      .upsert(
        {
          email: Email,
          first_name: First_Name ?? null,
          last_name: Last_Name ?? null,
          phone: Phone ?? null,
          brand_id: brand.brandId,
          lifecycle_stage: "candidate",
          zoho_lead_id: Lead_ID,
        },
        { onConflict: "email" },
      )
      .select("id")
      .single();

    if (candidateErr || !candidate) {
      const message = `candidates upsert failed: ${candidateErr?.message ?? "unknown"}`;
      await finalize("failed", null, message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Reuse the portal row if one already exists for this candidate
    // (happens when a seeded candidate gets enriched by their first
    // real Zoho lead). Otherwise generate a fresh token.
    const { data: existingPortal } = await app
      .from("candidates_in_portal")
      .select("token")
      .eq("candidate_id", candidate.id)
      .maybeSingle();

    let token = existingPortal?.token ?? null;
    if (!token) {
      token = generateToken(brand.brandSlug);
      const { error: portalErr } = await app
        .from("candidates_in_portal")
        .insert({
          candidate_id: candidate.id,
          token,
          current_chapter: 0,
          current_step: 0,
          prefilled_zip: Zip_Code ?? null,
          prefilled_phone: Phone ?? null,
        });
      if (portalErr) {
        const message = `candidates_in_portal insert failed: ${portalErr.message}`;
        await finalize("failed", candidate.id, message);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    const portalUrl = `https://${portalHost}/portal/${token}`;

    // Write Portal_Token + Portal_URL back to the originating Zoho lead
    // so the welcome email template can render the link. Failure here
    // is non-fatal — the portal row exists and the candidate can still
    // reach it via the loading page poll. We log the failure on the
    // webhook_events row so a future retry job can pick it up.
    let zohoCallbackError: string | null = null;
    try {
      await zohoApi.updateLead(Lead_ID!, {
        Portal_Token: token,
        Portal_URL: portalUrl,
      });
    } catch (err) {
      zohoCallbackError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[zoho-lead-created] Zoho updateLead failed for ${Lead_ID}: ${zohoCallbackError}`,
      );
    }

    await finalize(
      zohoCallbackError ? "partial" : "success",
      candidate.id,
      zohoCallbackError,
    );

    return NextResponse.json({
      success: true,
      candidate_id: candidate.id,
      portal_token: token,
      portal_url: portalUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[zoho-lead-created] unhandled error", err);
    await finalize("failed", null, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
