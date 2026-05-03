"use server";

import { createAppServiceClient } from "@/lib/supabase-app";
import type { EventCategory } from "@/lib/candidate-events";

export interface CandidateEventRow {
  id: string;
  candidate_id: string;
  brand_id: string;
  category: string;
  event_type: string;
  event_key: string | null;
  metadata: Record<string, unknown>;
  zoho_synced_at: string | null;
  zoho_sync_status: string | null;
  zoho_sync_error: string | null;
  created_at: string;
}

/**
 * Pull a candidate's recent event timeline. Defaults to all categories
 * unless `category` is set, and returns up to 200 events ordered newest
 * first. The composite index on (candidate_id, created_at desc) keeps
 * this fast even as the table grows — the per-candidate volume stays
 * small enough that paging isn't worth the API surface yet.
 */
export async function getCandidateEvents(
  candidateId: string,
  opts?: { limit?: number; category?: EventCategory },
): Promise<{ data: CandidateEventRow[] | null; error: string | null }> {
  const app = createAppServiceClient();
  let query = app
    .from("candidate_events")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);

  if (opts?.category) {
    query = query.eq("category", opts.category);
  }

  const { data, error } = await query;
  return {
    data: (data as CandidateEventRow[] | null) ?? null,
    error: error?.message ?? null,
  };
}

/**
 * Just the milestone events for a candidate, oldest first — useful for
 * reconstructing journey progression and rendering a status timeline.
 */
export async function getCandidateMilestones(
  candidateId: string,
): Promise<{ data: CandidateEventRow[] | null; error: string | null }> {
  const app = createAppServiceClient();
  const { data, error } = await app
    .from("candidate_events")
    .select("*")
    .eq("candidate_id", candidateId)
    .eq("category", "milestone")
    .order("created_at", { ascending: true });
  return {
    data: (data as CandidateEventRow[] | null) ?? null,
    error: error?.message ?? null,
  };
}

/**
 * Find every candidate in a brand who has fired a particular milestone
 * event, newest first. Used by status-count dashboards (e.g., "how many
 * have submitted the application this week"). Returns the candidate id
 * + the timestamp; downstream lookups join against bmave-core.candidates
 * for the human-readable name.
 */
export async function getCandidatesByMilestone(
  brandId: string,
  milestoneType: string,
): Promise<{
  data: Array<{ candidate_id: string; created_at: string }> | null;
  error: string | null;
}> {
  const app = createAppServiceClient();
  const { data, error } = await app
    .from("candidate_events")
    .select("candidate_id, created_at")
    .eq("brand_id", brandId)
    .eq("event_type", milestoneType)
    .order("created_at", { ascending: false });
  return {
    data:
      (data as
        | Array<{ candidate_id: string; created_at: string }>
        | null) ?? null,
    error: error?.message ?? null,
  };
}
