import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createCoreClient() {
  const url = process.env.NEXT_PUBLIC_BMAVE_CORE_URL;
  const serviceRoleKey = process.env.BMAVE_CORE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_BMAVE_CORE_URL or BMAVE_CORE_SERVICE_ROLE_KEY — required to read shared brands/candidates from bmave-core.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
