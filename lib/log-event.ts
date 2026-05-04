import "server-only";
import { waitUntil } from "@vercel/functions";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  isMilestone,
  ZOHO_STATUS_BY_MILESTONE,
  type EventCategory,
  type MilestoneEvent,
} from "@/lib/candidate-events";
import { getTransitionIdForMilestone } from "@/lib/zoho-blueprint-transitions";
import { zohoApi } from "@/lib/zoho-api";

// Zoho's DateTime fields reject the `Z` suffix and millisecond precision
// that `toISOString()` produces — they want `YYYY-MM-DDTHH:mm:ss±hh:mm`.
// Stripping the milliseconds and swapping `Z` → `+00:00` is enough to
// pass validation; the value is always UTC because we feed `Date` (which
// `toISOString` always emits in UTC).
function formatZohoDateTime(d: Date): string {
  return d.toISOString().slice(0, 19) + "+00:00";
}

export interface LogEventArgs {
  candidateId: string;
  brandId: string;
  category: EventCategory;
  eventType: string;
  eventKey?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append a row to candidate_events. Best-effort — failures are logged
 * but never thrown, since tracking should never break the user-visible
 * action that produced the event.
 *
 * For milestone events, the Zoho sync runs via Vercel's `waitUntil`
 * so it doesn't block the response. `waitUntil` extends the function's
 * lifetime past the response (unlike a bare promise, which Vercel will
 * kill once the response is sent), so the sync actually completes in
 * serverless. We use `@vercel/functions` rather than Next 15's `after()`
 * because the project is on 14.2 — same semantics, different package.
 */
export async function logEvent(args: LogEventArgs): Promise<void> {
  const supabase = createAppServiceClient();

  const milestone =
    args.category === "milestone" && isMilestone(args.eventType);
  const syncStatus = milestone ? "pending" : "skipped";

  const { data: event, error } = await supabase
    .from("candidate_events")
    .insert({
      candidate_id: args.candidateId,
      brand_id: args.brandId,
      category: args.category,
      event_type: args.eventType,
      event_key: args.eventKey ?? null,
      metadata: args.metadata ?? {},
      zoho_sync_status: syncStatus,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[log-event] insert failed", error);
    return;
  }

  if (milestone) {
    waitUntil(syncMilestoneToZoho(event.id, args));
  }
}

async function syncMilestoneToZoho(
  eventId: string,
  args: LogEventArgs,
): Promise<void> {
  const supabase = createAppServiceClient();
  const core = createCoreClient();
  const nowIso = () => new Date().toISOString();

  const { data: candidate } = await core
    .from("candidates")
    .select("zoho_lead_id")
    .eq("id", args.candidateId)
    .maybeSingle();

  if (!candidate?.zoho_lead_id) {
    // Candidate exists in Supabase but never came in via the Zoho
    // webhook (test seeds, manual rows). Mark both pipelines skipped
    // so we don't keep retrying.
    await supabase
      .from("candidate_events")
      .update({
        zoho_sync_status: "skipped",
        blueprint_transition_status: "skipped",
        zoho_synced_at: nowIso(),
      })
      .eq("id", eventId);
    return;
  }

  // The field-update sync and the Blueprint transition are independent
  // — a transition failure (e.g., lead already in target state) doesn't
  // mean the Portal_Status update failed. Track the two outcomes
  // separately and write both in a single trailing update.

  let zohoSyncStatus: "success" | "failed" = "success";
  let zohoSyncError: string | null = null;
  try {
    const status =
      ZOHO_STATUS_BY_MILESTONE[
        args.eventType as keyof typeof ZOHO_STATUS_BY_MILESTONE
      ];
    await zohoApi.updateLead(candidate.zoho_lead_id, {
      Portal_Status: status,
      Last_Active_Date: formatZohoDateTime(new Date()),
    });
  } catch (err) {
    zohoSyncStatus = "failed";
    zohoSyncError = err instanceof Error ? err.message : String(err);
    console.error(
      `[log-event] Zoho field update failed for event ${eventId}:`,
      err,
    );
  }

  // Blueprint transition runs only for milestones explicitly mapped in
  // TRANSITION_ID_BY_MILESTONE. Unmapped milestones (e.g.,
  // portal_first_visit, application_submitted) record 'skipped' so the
  // null state is unambiguous in dashboards.
  let transitionStatus: "success" | "failed" | "skipped" = "skipped";
  let transitionError: string | null = null;
  const transitionId = getTransitionIdForMilestone(
    args.eventType as MilestoneEvent,
  );
  if (transitionId) {
    try {
      await zohoApi.transitionLead(candidate.zoho_lead_id, transitionId);
      transitionStatus = "success";
    } catch (err) {
      transitionStatus = "failed";
      transitionError = err instanceof Error ? err.message : String(err);
      // Common cause: the lead is already in the target state, or the
      // transition is gated on data the lead doesn't have. Field updates
      // already landed, so we log a warning rather than escalating.
      console.warn(
        `[log-event] Blueprint transition failed for ${args.eventType} (event ${eventId}):`,
        transitionError,
      );
    }
  }

  await supabase
    .from("candidate_events")
    .update({
      zoho_sync_status: zohoSyncStatus,
      zoho_sync_error: zohoSyncError,
      blueprint_transition_status: transitionStatus,
      blueprint_transition_error: transitionError,
      zoho_synced_at: nowIso(),
    })
    .eq("id", eventId);
}
