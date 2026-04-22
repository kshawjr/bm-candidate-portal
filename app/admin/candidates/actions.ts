"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { getAdminUser } from "@/lib/supabase-auth";
import { cancelSlot, isGCalConfigured } from "@/lib/google-calendar";

export interface ResetCounts {
  responses_deleted: number;
  progress_deleted: number;
  bookings_deleted: number;
  calendar_events_deleted: number;
}

export type ResetResult =
  | { success: true; counts: ResetCounts }
  | { success: false; error: string };

/**
 * Wipe a candidate's portal progress back to Chapter 1 Step 1. Deletes
 * application responses, candidate_progress rows, and bookings. Optionally
 * also cancels the corresponding Google Calendar events.
 *
 * Guarded two ways:
 *   - admin auth (getAdminUser) — rejects if the caller isn't signed in
 *   - token confirmation — caller must re-type the token, matches exactly
 *
 * Calendar deletion is best-effort: if a cancel fails (event already gone,
 * calendar revoked, etc.) we log and continue. DB rows are always deleted.
 */
export async function resetCandidateAction(params: {
  token: string;
  confirmToken: string;
  deleteCalendarEvents: boolean;
}): Promise<ResetResult> {
  const user = await getAdminUser();
  if (!user) {
    return {
      success: false,
      error: "Not authorized. Sign in at /admin to use reset.",
    };
  }

  if (params.confirmToken !== params.token) {
    return {
      success: false,
      error: "Confirmation token doesn't match.",
    };
  }

  const app = createAppServiceClient();

  const { data: session, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", params.token)
    .maybeSingle();
  if (sessErr) {
    return { success: false, error: `Lookup failed: ${sessErr.message}` };
  }
  if (!session) {
    return { success: false, error: "No candidate found for that token." };
  }
  const portalId = session.id as string;

  let calendarDeleted = 0;

  // Best-effort calendar cleanup. Runs before DB deletes so we can read the
  // bookings to know which events to cancel; any cancel failure is logged
  // but doesn't block the DB cleanup below.
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
            (r) =>
              [r.id as string, r.calendar_email as string] as const,
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
    return { success: false, error: `Delete responses failed: ${respErr.message}` };
  }

  const { count: progressCount, error: progErr } = await app
    .from("candidate_progress")
    .delete({ count: "exact" })
    .eq("candidate_in_portal_id", portalId);
  if (progErr) {
    return { success: false, error: `Delete progress failed: ${progErr.message}` };
  }

  const { count: bookingsCount, error: bookErr } = await app
    .from("bookings")
    .delete({ count: "exact" })
    .eq("candidate_in_portal_id", portalId);
  if (bookErr) {
    return { success: false, error: `Delete bookings failed: ${bookErr.message}` };
  }

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      current_chapter: 0,
      current_step: 0,
      is_tour_complete: false,
      is_app_submitted: false,
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
    },
  };
}
