import "server-only";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { createFlightdeckClient } from "@/lib/flightdeck-client";
import {
  isMilestone,
  ZOHO_STATUS_BY_MILESTONE,
  type EventCategory,
  type MilestoneEvent,
} from "@/lib/candidate-events";
import { getTransitionIdForMilestone } from "@/lib/zoho-blueprint-transitions";
import { zohoApi } from "@/lib/zoho-api";
import {
  CREDIT_SCORE_RANGES,
  LIQUID_CAPITAL_RANGES,
  NET_WORTH_RANGES,
  OPENING_TIMELINE,
  findOptionLabel,
} from "@/lib/application-options";

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
    // Single-format datetime PUT. PR 62 added a dual-format retry +
    // verify-via-GET loop to diagnose silent failures; both formats
    // wrote 200 OK with empty read-backs, so the diagnostic ruled out
    // the date format itself. The remaining suspects (field API-name,
    // layout permission, workflow rule) are Zoho-admin territory — the
    // code can't fix them. Dropped the loop and committed to the
    // datetime form that matches every other Zoho DateTime field.
    const cqValue = formatZohoDateTime(new Date());
    console.log(
      `[log-event] CQ_Received write event=${eventId} value=${cqValue}`,
    );
    try {
      await zohoApi.updateLead(candidate.zoho_lead_id, {
        CQ_Received: cqValue,
      });
      cqSyncStatus = "success";
    } catch (err) {
      cqSyncStatus = "failed";
      cqSyncError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[log-event] CQ_Received write failed event=${eventId}:`,
        cqSyncError,
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

    // Financial answers → six Zoho fields (a text + picklist twin for
    // each of liquid capital / net worth / credit score). The picklist
    // copies (Liquid_Capital_2, Net_Worth_2, Credit_Score_2) drive
    // sales-team list filters; the plain text fields stay for legacy
    // reports that read free-text. All six land in a single PUT so
    // there's only one round-trip overhead.
    //
    // Source of truth is application_responses (per-question rows) in
    // the candidate-portal DB, keyed by candidate_in_portal_id —
    // joined here through candidates_in_portal.candidate_id.
    //
    // Best-effort: any failure (DB lookup, label miss, Zoho PUT) is
    // logged and the milestone flow continues. The Portal_Status leg
    // already succeeded by this point.
    try {
      const { data: portal } = await supabase
        .from("candidates_in_portal")
        .select("id")
        .eq("candidate_id", args.candidateId)
        .maybeSingle();

      if (portal?.id) {
        const { data: responses } = await supabase
          .from("application_responses")
          .select("field_key, field_value")
          .eq("candidate_in_portal_id", portal.id as string)
          .in("field_key", [
            "liquid_capital_range",
            "net_worth_range",
            "credit_score_range",
          ]);

        const byKey: Record<string, string> = {};
        for (const r of responses ?? []) {
          const v = r.field_value;
          if (typeof v === "string" && v.trim().length > 0) {
            byKey[r.field_key as string] = v.trim();
          }
        }

        const liquidLabel = findOptionLabel(
          LIQUID_CAPITAL_RANGES,
          byKey.liquid_capital_range,
        );
        const netWorthLabel = findOptionLabel(
          NET_WORTH_RANGES,
          byKey.net_worth_range,
        );
        const creditScoreLabel = findOptionLabel(
          CREDIT_SCORE_RANGES,
          byKey.credit_score_range,
        );

        // Only include fields where a current option label resolved.
        // Legacy values (older bucket schemes) skip — better to write
        // nothing than to write "200_500k (legacy)" to a picklist.
        const fieldsToWrite: Record<string, string> = {};
        if (liquidLabel) {
          fieldsToWrite.Liquid = liquidLabel;
          fieldsToWrite.Liquid_Capital_2 = liquidLabel;
        }
        if (netWorthLabel) {
          fieldsToWrite.Net_Worth = netWorthLabel;
          fieldsToWrite.Net_Worth_2 = netWorthLabel;
        }
        if (creditScoreLabel) {
          fieldsToWrite.Credit_Score = creditScoreLabel;
          fieldsToWrite.Credit_Score_2 = creditScoreLabel;
        }

        if (Object.keys(fieldsToWrite).length > 0) {
          try {
            await zohoApi.updateLead(candidate.zoho_lead_id, fieldsToWrite);
            console.log(
              `[log-event] financial fields written event=${eventId} fields=${Object.keys(fieldsToWrite).join(",")}`,
            );
          } catch (err) {
            console.warn(
              `[log-event] financial fields write failed event=${eventId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        } else {
          console.log(
            `[log-event] financial fields skipped event=${eventId} — no resolvable labels`,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[log-event] financial fields lookup failed event=${eventId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    // Location + timing → four Zoho fields. Source is the
    // flightdeck-side candidate_applications row (different table /
    // different Supabase project from the financial-fields source —
    // city/state/opening_timeline land there directly via the submit
    // action's INSERT, not as per-question rows). Sits in its own
    // try block so a flightdeck failure can't disturb the financial
    // writes above.
    //
    // Field mapping:
    //   city                                       → City (text)
    //   state                                      → State (text)
    //   city + ", " + state                        → Interested_DMA
    //   opening_timeline label OR "Other: <free>"  → How_soon
    try {
      const flightdeck = createFlightdeckClient();
      const { data: appData } = await flightdeck
        .from("candidate_applications")
        .select("city, state, opening_timeline")
        .eq("zoho_lead_id", candidate.zoho_lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (appData) {
        const city = (appData.city as string | null)?.trim() || null;
        const state = (appData.state as string | null)?.trim() || null;
        const dma = city && state ? `${city}, ${state}` : null;

        // Two shapes for opening_timeline in storage:
        //   "asap" / "3_6_months" / ...   → look up label
        //   "Other: <free text>"          → keep as-is (already
        //                                    human-readable; the submit
        //                                    action collapses
        //                                    opening_timeline_other_text
        //                                    into this prefixed form
        //                                    via resolveOther).
        const rawTimeline =
          (appData.opening_timeline as string | null)?.trim() || null;
        let howSoonLabel: string | null = null;
        if (rawTimeline) {
          if (rawTimeline.startsWith("Other:")) {
            howSoonLabel = rawTimeline;
          } else {
            howSoonLabel = findOptionLabel(OPENING_TIMELINE, rawTimeline);
          }
        }

        const locationFields: Record<string, string> = {};
        if (city) locationFields.City = city;
        if (state) locationFields.State = state;
        if (dma) locationFields.Interested_DMA = dma;
        if (howSoonLabel) locationFields.How_soon = howSoonLabel;

        if (Object.keys(locationFields).length > 0) {
          try {
            await zohoApi.updateLead(candidate.zoho_lead_id, locationFields);
            console.log(
              `[log-event] location/timing fields written event=${eventId} fields=${Object.keys(locationFields).join(",")}`,
            );
          } catch (err) {
            console.warn(
              `[log-event] location/timing fields write failed event=${eventId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        } else {
          console.log(
            `[log-event] location/timing fields skipped event=${eventId} — no resolvable values`,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[log-event] location/timing lookup failed event=${eventId}:`,
        err instanceof Error ? err.message : err,
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
