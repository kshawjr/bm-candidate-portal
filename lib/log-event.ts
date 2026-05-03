import "server-only";
import { waitUntil } from "@vercel/functions";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  isMilestone,
  ZOHO_STATUS_BY_MILESTONE,
  type EventCategory,
} from "@/lib/candidate-events";
import { zohoApi } from "@/lib/zoho-api";

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

  try {
    const { data: candidate } = await core
      .from("candidates")
      .select("zoho_lead_id")
      .eq("id", args.candidateId)
      .maybeSingle();

    if (!candidate?.zoho_lead_id) {
      // Candidate exists in Supabase but never came in via the Zoho
      // webhook (test seeds, manual rows). Mark as skipped so we don't
      // keep retrying.
      await supabase
        .from("candidate_events")
        .update({
          zoho_sync_status: "skipped",
          zoho_synced_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      return;
    }

    const status =
      ZOHO_STATUS_BY_MILESTONE[
        args.eventType as keyof typeof ZOHO_STATUS_BY_MILESTONE
      ];

    await zohoApi.updateLead(candidate.zoho_lead_id, {
      Portal_Status: status,
      Last_Active_Date: new Date().toISOString(),
    });

    await supabase
      .from("candidate_events")
      .update({
        zoho_sync_status: "success",
        zoho_synced_at: new Date().toISOString(),
      })
      .eq("id", eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[log-event] Zoho sync failed for event ${eventId}:`, err);
    await supabase
      .from("candidate_events")
      .update({
        zoho_sync_status: "failed",
        zoho_synced_at: new Date().toISOString(),
        zoho_sync_error: message,
      })
      .eq("id", eventId);
  }
}
