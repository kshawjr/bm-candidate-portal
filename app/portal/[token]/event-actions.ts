"use server";

import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { logEvent, type LogEventArgs } from "@/lib/log-event";

export type ClientLogEventArgs = Omit<
  LogEventArgs,
  "candidateId" | "brandId"
>;

/**
 * Client-callable wrapper around `logEvent`. Resolves (candidate_id,
 * brand_id) from the portal token server-side so client components can
 * fire tracking events without ever holding either id in memory.
 *
 * Best-effort: a missing session or candidate row silently no-ops rather
 * than throwing. Tracking should never surface as a visible failure to
 * the candidate.
 */
export async function logEventByTokenAction(
  token: string,
  args: ClientLogEventArgs,
): Promise<void> {
  if (!token || typeof token !== "string") return;

  const app = createAppServiceClient();
  const { data: session } = await app
    .from("candidates_in_portal")
    .select("candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (!session?.candidate_id) return;

  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("brand_id")
    .eq("id", session.candidate_id as string)
    .maybeSingle();
  if (!candidate?.brand_id) return;

  await logEvent({
    candidateId: session.candidate_id as string,
    brandId: candidate.brand_id as string,
    ...args,
  });
}
