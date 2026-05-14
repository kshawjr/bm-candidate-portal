import "server-only";
import { createCoreClient } from "@/lib/core-client";
import { createAppServiceClient } from "@/lib/supabase-app";

export interface TestCandidateConfig {
  token: string;
  firstName: string;
  lastName: string;
  email: string;
  brandSlug: "hounds-town-usa" | "cruisin-tikis";
  prefilledZip: string | null;
  prefilledPhone: string | null;
}

const TEST_CANDIDATES: Record<string, TestCandidateConfig> = {
  "test-token-123": {
    token: "test-token-123",
    firstName: "Jamie",
    lastName: "Rivera",
    email: "test-candidate-ht@example.com",
    brandSlug: "hounds-town-usa",
    prefilledZip: "11237",
    prefilledPhone: "919-555-0123",
  },
  "test-token-456": {
    token: "test-token-456",
    firstName: "Jamie",
    lastName: "Rivera",
    email: "test-candidate-ct@example.com",
    brandSlug: "cruisin-tikis",
    prefilledZip: null,
    prefilledPhone: "305-555-0456",
  },
};

export type TestCandidateResult =
  | { success: true; message: string; created: boolean }
  | { success: false; message: string };

/**
 * Create or reset a test candidate. Idempotent.
 *
 * If the candidate doesn't exist:
 *   - Creates row in bmave-core.candidates
 *   - Creates row in this app's candidates_in_portal
 *
 * If the candidate exists:
 *   - Resets progress to chapter 0, step 0
 *   - Clears all dismissal arrays + onboarding flags
 *   - Re-stamps prefilled fields
 *   - Wipes derived rows: candidate_events, application_responses,
 *     candidate_progress, bookings, booking_unavailable_requests
 *
 * Mirrors resetCandidateAction's cleanup so a reset here produces the same
 * blank-slate state as the regular candidate-reset modal — without that,
 * test candidates would carry stale step-completion / booking rows that
 * the portal UI would still treat as done.
 *
 * Calendar events from real Google Calendar are NOT cancelled here — the
 * test rep's calendar is shared with real candidates and we don't want a
 * "reset test candidate" click to delete real events. Bookings are removed
 * from the DB only; calendar entries (if any) are left orphaned.
 */
export async function createOrResetTestCandidate(
  token: string,
): Promise<TestCandidateResult> {
  const config = TEST_CANDIDATES[token];
  if (!config) {
    return { success: false, message: `Unknown test token: ${token}` };
  }

  const core = createCoreClient();
  const app = createAppServiceClient();

  const { data: brand, error: brandErr } = await core
    .from("brands")
    .select("id")
    .eq("slug", config.brandSlug)
    .single();
  if (brandErr || !brand) {
    return {
      success: false,
      message: `Brand not found: ${config.brandSlug} (${brandErr?.message ?? "no row"})`,
    };
  }
  const brandId = brand.id as string;

  const { data: rep } = await core
    .from("reps")
    .select("id")
    .eq("brand_id", brandId)
    .limit(1)
    .maybeSingle();

  const { data: candidate, error: cErr } = await core
    .from("candidates")
    .upsert(
      {
        email: config.email,
        first_name: config.firstName,
        last_name: config.lastName,
        brand_id: brandId,
        lifecycle_stage: "candidate",
        assigned_rep_id: (rep?.id as string | undefined) ?? null,
      },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (cErr || !candidate) {
    return {
      success: false,
      message: `Candidate upsert failed: ${cErr?.message ?? "no row"}`,
    };
  }
  const candidateId = candidate.id as string;

  const { data: existingPortal } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", config.token)
    .maybeSingle();
  const existingPortalId = (existingPortal?.id as string | undefined) ?? null;

  // When resetting an existing candidate, wipe derived rows first so the
  // upsert below leaves a truly clean slate. New candidates skip this.
  if (existingPortalId) {
    await app
      .from("application_responses")
      .delete()
      .eq("candidate_in_portal_id", existingPortalId);

    await app
      .from("candidate_progress")
      .delete()
      .eq("candidate_in_portal_id", existingPortalId);

    await app
      .from("bookings")
      .delete()
      .eq("candidate_in_portal_id", existingPortalId);

    await app
      .from("booking_unavailable_requests")
      .delete()
      .eq("candidate_in_portal_id", existingPortalId);

    await app.from("candidate_events").delete().eq("candidate_id", candidateId);
  }

  const { error: pErr } = await app.from("candidates_in_portal").upsert(
    {
      candidate_id: candidateId,
      token: config.token,
      current_chapter: 0,
      current_step: 0,
      is_tour_complete: false,
      is_app_submitted: false,
      has_seen_welcome: false,
      dismissed_chapter_intros: [],
      dismissed_chapter_videos: [],
      dismissed_chapter_completes: [],
      dismissed_step_transitions: [],
      dismissed_step_transition_videos: [],
      last_visited_step_id: null,
      prefilled_zip: config.prefilledZip,
      prefilled_phone: config.prefilledPhone,
      last_activity_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );
  if (pErr) {
    return {
      success: false,
      message: `Portal record upsert failed: ${pErr.message}`,
    };
  }

  return {
    success: true,
    created: !existingPortalId,
    message: existingPortalId
      ? `Reset existing candidate ${config.token} (${config.firstName})`
      : `Created candidate ${config.token} (${config.firstName})`,
  };
}

/** Status row for the admin UI — one entry per known test token. */
export interface TestCandidateStatus {
  token: string;
  brandSlug: TestCandidateConfig["brandSlug"];
  firstName: string;
  exists: boolean;
}

export async function getTestCandidatesStatus(): Promise<TestCandidateStatus[]> {
  const app = createAppServiceClient();
  const tokens = Object.keys(TEST_CANDIDATES);

  const { data: existing } = await app
    .from("candidates_in_portal")
    .select("token")
    .in("token", tokens);

  const existingTokens = new Set(
    (existing ?? []).map((r) => r.token as string),
  );

  return Object.values(TEST_CANDIDATES).map((config) => ({
    token: config.token,
    brandSlug: config.brandSlug,
    firstName: config.firstName,
    exists: existingTokens.has(config.token),
  }));
}
