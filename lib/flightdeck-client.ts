import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cross-project Supabase client for the **flightdeck** project. Used
// by the application-submit flow to write candidate_applications rows
// and upload PDFs to the application-pdfs bucket.
//
// Mirrors lib/core-client.ts and the bmave-core pattern: server-only,
// service-role, auth context disabled because we never want the
// client to silently switch to an end-user JWT.
//
// Service role key is sensitive — it can read/write any row in
// flightdeck. Never bundle to the browser; the "server-only" import
// + the env var split (SERVICE_ROLE_KEY without the NEXT_PUBLIC_
// prefix) keeps Next from leaking it.
export function createFlightdeckClient() {
  const url = process.env.NEXT_PUBLIC_FLIGHTDECK_URL;
  const serviceRoleKey = process.env.FLIGHTDECK_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_FLIGHTDECK_URL or FLIGHTDECK_SERVICE_ROLE_KEY — required to write applications + PDFs to flightdeck.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
