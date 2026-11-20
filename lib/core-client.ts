import "server-only";
import { createClient } from "@supabase/supabase-js";
import { noStoreFetch } from "./supabase-no-store-fetch";

/**
 * Where the shared "core" data (brands, candidates, portal_content, ...) and the
 * brand-assets files live.
 *
 * - Default: the separate bmave-core project (NEXT_PUBLIC_BMAVE_CORE_URL / BMAVE_CORE_SERVICE_ROLE_KEY).
 * - CORE_IN_FLIGHTDECK=1: the copy inside FlightDeck's database, schema "core", and FlightDeck's
 *   brand-assets bucket (NEXT_PUBLIC_FLIGHTDECK_URL / FLIGHTDECK_SERVICE_ROLE_KEY).
 *
 * Must be flipped at the same time as FlightDeck's own CORE_IN_FLIGHTDECK switch,
 * because both apps write the same candidate records.
 */
export function coreConnection() {
  const inFlightDeck = process.env.CORE_IN_FLIGHTDECK === "1";
  return inFlightDeck
    ? {
        inFlightDeck,
        url: process.env.NEXT_PUBLIC_FLIGHTDECK_URL,
        serviceRoleKey: process.env.FLIGHTDECK_SERVICE_ROLE_KEY,
        urlName: "NEXT_PUBLIC_FLIGHTDECK_URL",
        keyName: "FLIGHTDECK_SERVICE_ROLE_KEY",
      }
    : {
        inFlightDeck,
        url: process.env.NEXT_PUBLIC_BMAVE_CORE_URL,
        serviceRoleKey: process.env.BMAVE_CORE_SERVICE_ROLE_KEY,
        urlName: "NEXT_PUBLIC_BMAVE_CORE_URL",
        keyName: "BMAVE_CORE_SERVICE_ROLE_KEY",
      };
}

export function createCoreClient() {
  const { inFlightDeck, url, serviceRoleKey, urlName, keyName } = coreConnection();

  if (!url || !serviceRoleKey) {
    throw new Error(
      `Missing ${urlName} or ${keyName} — required to read shared brands/candidates from ${inFlightDeck ? "FlightDeck (schema core)" : "bmave-core"}.`,
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
    // Runtime schema is "core" when switched; typed as "public" so callers keep the same client type.
    ...(inFlightDeck ? { db: { schema: "core" as "public" } } : {}),
  });
}
