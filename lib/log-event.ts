import "server-only";
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
 * PR 58: milestone Zoho sync now runs INLINE (awaited) rather than via
 * `waitUntil`. Production showed milestone events stuck at
 * `zoho_sync_status='pending'` — `waitUntil` wasn't reliably keeping
 * the function alive past the response (likely cold-start /
 * fluid-compute interaction). The 1-2s latency hit on milestone
 * actions is worth more than silently lost syncs. Non-milestone events
 * stay fast — they never call out to Zoho.
 */
export async function logEvent(args: LogEventArgs): Promise<void> {
  const supabase = createAppServiceClient();

  const milestone =
    args.category === "milestone" && isMilestone(args.eventType);
  const syncStatus = milestone ? "pending" : "skipped";

  // Milestone events are once-per-candidate by definition. Pre-insert
  // check skips the write (and the Zoho round-trip below) when the
  // milestone has already fired. Catches the common "navigate forward
  // then back then forward" pattern that would otherwise log the same
  // milestone twice and double-write Zoho. Non-milestone events skip
  // this check — they can repeat freely.
  // Note: there's a tiny race window between SELECT and INSERT for two
  // concurrent calls, but the Zoho update is idempotent (setting the
  // same Portal_Status twice is harmless), so duplicates are benign.
  if (milestone) {
    const { data: existing } = await supabase
      .from("candidate_events")
      .select("id")
      .eq("candidate_id", args.candidateId)
      .eq("event_type", args.eventType)
      .eq("category", "milestone")
      .limit(1)
      .maybeSingle();
    if (existing) return;
  }

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
    // Inline await: blocks the calling action by 1-2s for milestone
    // events but guarantees the row leaves 'pending' before the
    // function returns. Outer catch keeps logEvent best-effort even
    // if the sync hits an unexpected runtime failure (network drop,
    // Supabase outage) outside the per-call try/catches inside
    // syncMilestoneToZoho.
    try {
      await syncMilestoneToZoho(event.id, args);
    } catch (err) {
      console.error(
        `[log-event] syncMilestoneToZoho threw for event ${event.id}:`,
        err,
      );
    }
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
    // webhook (test seeds, manual rows). Mark every pipeline skipped
    // so we don't keep retrying. For application_submitted, that
    // includes the PR 61 cq + tag legs; for other milestones those
    // columns stay null since they were never applicable.
    const isAppSubmitted = args.eventType === "application_submitted";
    await supabase
      .from("candidate_events")
      .update({
        zoho_sync_status: "skipped",
        blueprint_transition_status: "skipped",
        cq_sync_status: isAppSubmitted ? "skipped" : null,
        tag_sync_status: isAppSubmitted ? "skipped" : null,
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

  // PR 61: application_submitted carries two extra Zoho writes —
  // CQ_Received (DateTime field that the sales team filters on for
  // "leads who finished the application") and an "Application
  // Submitted" tag. Both are best-effort: they fire after the main
  // Portal_Status update succeeded or failed, share none of its
  // status, and are tracked separately on the row so we can tell
  // which leg failed without parsing combined error text.
  let cqSyncStatus: "success" | "failed" | null = null;
  let cqSyncError: string | null = null;
  let tagSyncStatus: "success" | "failed" | null = null;
  let tagSyncError: string | null = null;
  if (args.eventType === "application_submitted") {
    // PR 62: in production the DateTime PUT to CQ_Received returns 200
    // but the field stays empty — Last_Active_Date works fine with the
    // exact same formatZohoDateTime() value, so the format itself is
    // not the problem (likely API-name mismatch, layout permission,
    // or workflow side-effect). To localize the cause, write +
    // verify-via-GET. If the DateTime form doesn't take, fall back to
    // a date-only string (Zoho DateTime fields often accept a bare
    // date and convert internally) and verify again. The fetch-back
    // is permanent for now since this milestone is currently broken;
    // a follow-up PR can drop it once the root cause is fixed.
    const now = new Date();
    const attempts: { format: "datetime" | "date"; value: string }[] = [
      { format: "datetime", value: formatZohoDateTime(now) },
      { format: "date", value: now.toISOString().slice(0, 10) },
    ];

    let cqApplied = false;
    let cqLastError: string | null = null;
    for (const attempt of attempts) {
      console.log(
        `[log-event] CQ_Received attempt event=${eventId} format=${attempt.format} value=${attempt.value}`,
      );
      try {
        await zohoApi.updateLead(candidate.zoho_lead_id, {
          CQ_Received: attempt.value,
        });
      } catch (err) {
        cqLastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[log-event] CQ_Received PUT threw event=${eventId} format=${attempt.format}:`,
          cqLastError,
        );
        continue;
      }

      // Read it back and check whether the value actually landed.
      // A null/empty stored value with a 200 PUT is the signature of
      // a silent rejection — log enough to diagnose without flooding.
      try {
        const verify = await zohoApi.getLead(candidate.zoho_lead_id, [
          "CQ_Received",
        ]);
        const stored = (verify?.CQ_Received ?? null) as unknown;
        console.log(
          `[log-event] CQ_Received verify event=${eventId} format=${attempt.format} stored=${JSON.stringify(stored)}`,
        );
        if (
          stored !== null &&
          stored !== undefined &&
          stored !== "" &&
          !(typeof stored === "string" && stored.trim() === "")
        ) {
          cqApplied = true;
          break;
        }
        cqLastError = `200 OK but field stayed empty after format=${attempt.format}`;
      } catch (err) {
        cqLastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[log-event] CQ_Received verify GET failed event=${eventId} format=${attempt.format}:`,
          cqLastError,
        );
      }
    }

    cqSyncStatus = cqApplied ? "success" : "failed";
    cqSyncError = cqApplied ? null : cqLastError;
    if (!cqApplied) {
      console.warn(
        `[log-event] CQ_Received never took for event ${eventId} ` +
          `(zoho_lead_id=${candidate.zoho_lead_id}). Both formats wrote ` +
          `200 OK but the field stayed empty on read-back. Likely cause: ` +
          `field API name mismatch, layout-level permission, or a ` +
          `workflow rule that wipes the value — not the date format.`,
      );
    }

    try {
      await zohoApi.addTags(candidate.zoho_lead_id, ["Application Submitted"]);
      tagSyncStatus = "success";
    } catch (err) {
      tagSyncStatus = "failed";
      tagSyncError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[log-event] addTags failed for event ${eventId}:`,
        tagSyncError,
      );
    }
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
      // PR 61: only populated for application_submitted; null on every
      // other milestone so the column reads as "not applicable" rather
      // than "skipped".
      cq_sync_status: cqSyncStatus,
      cq_sync_error: cqSyncError,
      tag_sync_status: tagSyncStatus,
      tag_sync_error: tagSyncError,
      zoho_synced_at: nowIso(),
    })
    .eq("id", eventId);
}
