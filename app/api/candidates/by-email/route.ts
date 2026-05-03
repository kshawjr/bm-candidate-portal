import "server-only";
import { NextResponse } from "next/server";
import { createCoreClient } from "@/lib/core-client";
import { createAppServiceClient } from "@/lib/supabase-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by /loading after a Gravity Form submission to find the
// candidate row that the Zoho webhook just created. Returns 404 until
// the webhook has finished writing both the bmave-core.candidates row
// and the candidates_in_portal token.
//
// Note: this endpoint is unauthenticated and lets a caller probe
// whether an arbitrary email address has a candidate record. That's
// acceptable for the polling-during-loading flow but worth tightening
// (rate limit, short-lived signed param, or proxy-only IP allowlist)
// if it ever becomes a stable public endpoint.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("id, brand_id")
    .eq("email", email)
    .maybeSingle();

  if (!candidate) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const app = createAppServiceClient();
  const { data: portalRow } = await app
    .from("candidates_in_portal")
    .select("token")
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  if (!portalRow?.token) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  let brandSlug: string | null = null;
  if (candidate.brand_id) {
    const { data: brand } = await core
      .from("brands")
      .select("slug")
      .eq("id", candidate.brand_id)
      .maybeSingle();
    brandSlug = brand?.slug ?? null;
  }

  return NextResponse.json({
    found: true,
    token: portalRow.token,
    brand_slug: brandSlug,
  });
}
