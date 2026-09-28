import { NextResponse, type NextRequest } from "next/server";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { logEvent } from "@/lib/log-event";

// Short re-engagement link: https://<brand host>/a/<token>
//
// Written to Zoho's CQ_Link field (webhook at lead creation +
// scripts/backfill-cq-link.ts) so sales can drop a short link into a
// follow-up email/SMS. A click:
//   1. logs the `reengaged_via_link` milestone (→ Zoho tag "Reengaged
//      Link" + Last_Active_Date; Portal_Status is NOT touched; no
//      Blueprint transition), then
//   2. redirects to /portal/<token>?step=application, which the portal
//      page honors by landing on the application step (only when that
//      step is in the candidate's current chapter — see page.tsx).
//
// Route handler (not page.tsx) because this URL never renders anything:
// it's a pure log-then-redirect, and a handler lets us set the status
// code and no-store caching explicitly.
//
// Middleware runs on /a/* (its matcher only excludes _next, favicon,
// api/ and auth/callback) and adds no auth gate, so this is public in
// exactly the way /portal/* is.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  const token = params.token;
  const portalPath = `/portal/${encodeURIComponent(token)}`;

  // Look up the candidate the same way /portal/[token] does
  // (candidates_in_portal.token → candidate_id → bmave-core
  // candidates.brand_id). Any miss or error just skips logging — we
  // still redirect to the portal, which renders its own not-found page
  // for a bad token (same behavior as a bad /portal/<token> link).
  try {
    const app = createAppServiceClient();
    const { data: session } = await app
      .from("candidates_in_portal")
      .select("candidate_id")
      .eq("token", token)
      .maybeSingle();

    if (session?.candidate_id) {
      const core = createCoreClient();
      const { data: candidate } = await core
        .from("candidates")
        .select("brand_id")
        .eq("id", session.candidate_id as string)
        .maybeSingle();

      if (candidate?.brand_id) {
        // Best-effort: logEvent already swallows its own insert/Zoho
        // failures; the outer try/catch covers anything that throws
        // before it (missing env, client construction). Never blocks
        // the redirect.
        await logEvent({
          candidateId: session.candidate_id as string,
          brandId: candidate.brand_id as string,
          category: "milestone",
          eventType: "reengaged_via_link",
          metadata: {
            via: "short_url",
            user_agent: request.headers.get("user-agent") ?? "",
          },
        });
      }
    }
  } catch (err) {
    console.warn(
      "[a/token] reengaged_via_link logging failed; redirecting anyway:",
      err instanceof Error ? err.message : err,
    );
  }

  const target = new URL(`${portalPath}?step=application`, request.url);
  const response = NextResponse.redirect(target, 307);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
