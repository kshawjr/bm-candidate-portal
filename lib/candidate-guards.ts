import "server-only";

import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";

export interface CandidateOnJourney {
  id: string;
  candidate_id: string;
  token: string;
  first_name: string | null;
  last_name: string | null;
  current_chapter: number;
  current_step: number;
}

/**
 * Resolve the set of candidate_ids belonging to a given brand. Cached per
 * brand lookup so repeated calls inside a single server action don't hit
 * bmave-core more than once.
 */
async function candidateIdsForBrand(brandId: string): Promise<string[]> {
  const core = createCoreClient();
  const { data, error } = await core
    .from("candidates")
    .select("id")
    .eq("brand_id", brandId);
  if (error) throw new Error(`candidates lookup failed: ${error.message}`);
  return (data ?? []).map((r) => r.id);
}

async function hydrateCandidates(
  sessions: Array<{
    id: string;
    candidate_id: string;
    token: string;
    current_chapter: number;
    current_step: number;
  }>,
): Promise<CandidateOnJourney[]> {
  if (sessions.length === 0) return [];
  const core = createCoreClient();
  const ids = sessions.map((s) => s.candidate_id);
  const { data: people } = await core
    .from("candidates")
    .select("id, first_name, last_name")
    .in("id", ids);
  const byId = new Map(
    (people ?? []).map((p) => [p.id as string, p] as const),
  );
  return sessions.map((s) => {
    const person = byId.get(s.candidate_id);
    return {
      id: s.id,
      candidate_id: s.candidate_id,
      token: s.token,
      first_name: (person?.first_name as string | null | undefined) ?? null,
      last_name: (person?.last_name as string | null | undefined) ?? null,
      current_chapter: s.current_chapter,
      current_step: s.current_step,
    };
  });
}

/**
 * Candidates currently sitting on a given stop. Positional: we resolve the
 * stop to its position within the brand's ordered stops and match
 * candidates_in_portal.current_chapter by index.
 */
export async function getCandidatesOnStop(
  stopKey: string,
  brandId: string,
): Promise<CandidateOnJourney[]> {
  const app = createAppServiceClient();

  const { data: stopRow, error: stopErr } = await app
    .from("stops_config")
    .select("position")
    .eq("brand_id", brandId)
    .eq("stop_key", stopKey)
    .maybeSingle();
  if (stopErr) throw new Error(`stop lookup failed: ${stopErr.message}`);
  if (!stopRow) return [];

  const candidateIds = await candidateIdsForBrand(brandId);
  if (candidateIds.length === 0) return [];

  const { data: sessions, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id, token, current_chapter, current_step")
    .in("candidate_id", candidateIds)
    .eq("current_chapter", stopRow.position);
  if (sessErr) throw new Error(`sessions lookup failed: ${sessErr.message}`);

  return hydrateCandidates(sessions ?? []);
}

/**
 * Candidates currently sitting on a specific step. Positional match on both
 * stop index and step index within that stop.
 */
export async function getCandidatesOnStep(
  stepId: string,
): Promise<CandidateOnJourney[]> {
  const app = createAppServiceClient();

  const { data: stepRow, error: stepErr } = await app
    .from("steps_config")
    .select("brand_id, stop_key, position")
    .eq("id", stepId)
    .maybeSingle();
  if (stepErr) throw new Error(`step lookup failed: ${stepErr.message}`);
  if (!stepRow) return [];

  const { data: stopRow, error: stopErr } = await app
    .from("stops_config")
    .select("position")
    .eq("brand_id", stepRow.brand_id)
    .eq("stop_key", stepRow.stop_key)
    .maybeSingle();
  if (stopErr) throw new Error(`stop lookup failed: ${stopErr.message}`);
  if (!stopRow) return [];

  const candidateIds = await candidateIdsForBrand(stepRow.brand_id);
  if (candidateIds.length === 0) return [];

  const { data: sessions, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id, token, current_chapter, current_step")
    .in("candidate_id", candidateIds)
    .eq("current_chapter", stopRow.position)
    .eq("current_step", stepRow.position);
  if (sessErr) throw new Error(`sessions lookup failed: ${sessErr.message}`);

  return hydrateCandidates(sessions ?? []);
}
