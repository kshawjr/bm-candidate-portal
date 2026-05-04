"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { cancelSlot, isGCalConfigured } from "@/lib/google-calendar";

export interface ResetCounts {
  responses_deleted: number;
  progress_deleted: number;
  bookings_deleted: number;
  calendar_events_deleted: number;
  events_deleted: number;
}

export type ResetResult =
  | { success: true; counts: ResetCounts }
  | { success: false; error: string };

/**
 * Wipe a candidate's portal progress back to Chapter 1 Step 1. Deletes
 * application responses, candidate_progress rows, and bookings. Optionally
 * also cancels the corresponding Google Calendar events.
 *
 * Calendar deletion is best-effort: a cancel failure (event already gone,
 * calendar revoked) is logged and skipped. DB rows are always deleted.
 */
export async function resetCandidateAction(params: {
  token: string;
  confirmToken: string;
  deleteCalendarEvents: boolean;
}): Promise<ResetResult> {
  // PR 48: admin auth gate is disabled (PR 47). Previously checked
  // getAdminUser() and bailed for unauthed callers; bypass while the
  // middleware-level gate is off so admins can actually run resets.
  // See TODO_AUTH.md for restoration. The token-confirmation check
  // below remains the safety net against accidental destructive runs.

  if (params.confirmToken !== params.token) {
    return {
      success: false,
      error: "Token confirmation doesn't match",
    };
  }

  const app = createAppServiceClient();

  const { data: session, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id")
    .eq("token", params.token)
    .maybeSingle();
  if (sessErr) {
    return { success: false, error: `Lookup failed: ${sessErr.message}` };
  }
  if (!session) {
    return { success: false, error: "Candidate not found" };
  }
  const portalId = session.id as string;
  const candidateId = (session.candidate_id as string | null) ?? null;

  let calendarDeleted = 0;

  // Best-effort calendar cleanup. Runs before DB deletes so we can read the
  // bookings to find event IDs; any cancel failure is logged but doesn't
  // block the DB cleanup below.
  if (params.deleteCalendarEvents && isGCalConfigured()) {
    const { data: bookings } = await app
      .from("bookings")
      .select("id, rep_id, google_event_id")
      .eq("candidate_in_portal_id", portalId);

    if (bookings && bookings.length > 0) {
      const core = createCoreClient();
      const repIds = Array.from(
        new Set(
          bookings
            .map((b) => b.rep_id as string | null)
            .filter((id): id is string => typeof id === "string"),
        ),
      );
      const { data: reps } = repIds.length
        ? await core
            .from("reps")
            .select("id, calendar_email")
            .in("id", repIds)
        : { data: [] };
      const repEmailById = new Map<string, string>(
        (reps ?? [])
          .map(
            (r) => [r.id as string, r.calendar_email as string] as const,
          )
          .filter(([, email]) => typeof email === "string" && email.length > 0),
      );

      for (const b of bookings) {
        const email = b.rep_id ? repEmailById.get(b.rep_id as string) : null;
        const eventId = b.google_event_id as string | null;
        if (!email || !eventId) continue;
        try {
          await cancelSlot(email, eventId);
          calendarDeleted += 1;
        } catch (e) {
          console.error(
            `[reset] cancelSlot failed for booking ${b.id as string}:`,
            e,
          );
        }
      }
    }
  }

  const { count: responsesCount, error: respErr } = await app
    .from("application_responses")
    .delete({ count: "exact" })
    .eq("candidate_in_portal_id", portalId);
  if (respErr) {
    return {
      success: false,
      error: `Delete responses failed: ${respErr.message}`,
    };
  }

  const { count: progressCount, error: progErr } = await app
    .from("candidate_progress")
    .delete({ count: "exact" })
    .eq("candidate_in_portal_id", portalId);
  if (progErr) {
    return {
      success: false,
      error: `Delete progress failed: ${progErr.message}`,
    };
  }

  const { count: bookingsCount, error: bookErr } = await app
    .from("bookings")
    .delete({ count: "exact" })
    .eq("candidate_in_portal_id", portalId);
  if (bookErr) {
    return {
      success: false,
      error: `Delete bookings failed: ${bookErr.message}`,
    };
  }

  // PR 40: scheduling escape-hatch requests get marked resolved on reset
  // so they stop showing the badge but stay in the audit trail. (Hard
  // delete would lose the history of who asked for help when.)
  await app
    .from("booking_unavailable_requests")
    .update({ status: "resolved" })
    .eq("candidate_in_portal_id", portalId)
    .eq("status", "pending");

  // PR 58: clear candidate_events too. The events table is keyed by
  // bmave-core candidate_id (cross-project), not portal_id, so we
  // delete in a separate query. Without this, the dedup checks on
  // milestone fires (portal_first_visit, education_completed) would
  // skip every retried test run because the old events still exist.
  let eventsDeleted = 0;
  if (candidateId) {
    const { count: eventsCount, error: evErr } = await app
      .from("candidate_events")
      .delete({ count: "exact" })
      .eq("candidate_id", candidateId);
    if (evErr) {
      // Best-effort — surface the count failure but don't block the
      // rest of the reset. The events table is large and individual
      // failures shouldn't strand the candidate in a half-reset state.
      console.warn(
        `[reset] candidate_events delete failed for ${candidateId}:`,
        evErr,
      );
    } else {
      eventsDeleted = eventsCount ?? 0;
    }
  }

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      current_chapter: 0,
      current_step: 0,
      is_tour_complete: false,
      is_app_submitted: false,
      // Reset onboarding popups so the candidate sees them again on next
      // load — the main reason to reset a candidate is to walk through the
      // experience fresh. All four dismissal arrays + the deprecated
      // has_seen_welcome boolean (kept for back-compat from PR 31) are
      // cleared so every chapter video, intro popup, complete celebration,
      // and step transition re-fires.
      has_seen_welcome: false,
      dismissed_chapter_videos: [],
      dismissed_chapter_intros: [],
      dismissed_chapter_completes: [],
      dismissed_step_transitions: [],
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", portalId);
  if (updErr) {
    return { success: false, error: `Reset state failed: ${updErr.message}` };
  }

  revalidatePath(`/portal/${params.token}`);
  revalidatePath("/admin/candidates");

  return {
    success: true,
    counts: {
      responses_deleted: responsesCount ?? 0,
      progress_deleted: progressCount ?? 0,
      bookings_deleted: bookingsCount ?? 0,
      calendar_events_deleted: calendarDeleted,
      events_deleted: eventsDeleted,
    },
  };
}
