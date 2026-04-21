"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import {
  bookSlot,
  cancelSlot,
  getAvailableSlots,
  isGCalConfigured,
  type ScheduleConfig,
  type Slot,
} from "@/lib/google-calendar";

/**
 * Generic "advance the candidate past the step they just finished" — bumps
 * current_step only, no stop-wide flags. Used by video and schedule steps.
 */
export async function advanceStepAction(
  token: string,
  nextStepIdx: number,
): Promise<void> {
  const app = createAppServiceClient();
  const { error } = await app
    .from("candidates_in_portal")
    .update({
      current_step: nextStepIdx,
      last_activity_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) throw new Error(`advanceStepAction failed: ${error.message}`);
  revalidatePath(`/portal/${token}`);
}

/**
 * Mark the brand tour complete for the candidate on this token, and advance
 * current_step to the supplied index. The caller (client shell) computes
 * nextStepIdx based on how many steps exist in the current stop, so this
 * action doesn't need to re-derive it.
 */
export async function completeTourAction(
  token: string,
  nextStepIdx: number,
): Promise<void> {
  const app = createAppServiceClient();
  const { error } = await app
    .from("candidates_in_portal")
    .update({
      is_tour_complete: true,
      current_step: nextStepIdx,
      last_activity_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) {
    throw new Error(`completeTourAction failed: ${error.message}`);
  }
  revalidatePath(`/portal/${token}`);
}

/**
 * Resolve a candidates_in_portal row by token and return its id. Used by the
 * save/submit actions below.
 */
async function portalIdForToken(
  app: ReturnType<typeof createAppServiceClient>,
  token: string,
): Promise<string> {
  const { data, error } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`portal lookup failed: ${error.message}`);
  if (!data) throw new Error(`no candidates_in_portal row for token`);
  return data.id as string;
}

/**
 * Upsert a single application answer. Called on advance-to-next-screen so
 * candidates never lose progress if they close the tab.
 */
export async function saveApplicationAnswerAction(
  token: string,
  fieldKey: string,
  fieldValue: unknown,
): Promise<void> {
  const app = createAppServiceClient();
  const portalId = await portalIdForToken(app, token);
  const { error } = await app
    .from("application_responses")
    .upsert(
      {
        candidate_in_portal_id: portalId,
        field_key: fieldKey,
        field_value: fieldValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_in_portal_id,field_key" },
    );
  if (error) {
    throw new Error(`saveApplicationAnswer failed: ${error.message}`);
  }
  // Bump the candidate's last_activity_at so the journey card stays fresh
  // (e.g., avoids showing the "stalled" variant while a candidate is
  // actively filling out the form).
  await app
    .from("candidates_in_portal")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", portalId);
  // No revalidatePath here — saves are high-frequency and the server side
  // doesn't need to re-render until submit.
}

/**
 * Submit the application. Writes any final answers in a single batch, flips
 * is_app_submitted, advances to Stop 2 (Say hi) at step 0, and logs a
 * candidate_progress audit row.
 */
export async function submitApplicationAction(
  token: string,
  finalAnswers: Record<string, unknown>,
): Promise<void> {
  const app = createAppServiceClient();
  const portalId = await portalIdForToken(app, token);

  // Batch upsert any answers that weren't already persisted on advance.
  const rows = Object.entries(finalAnswers).map(([field_key, field_value]) => ({
    candidate_in_portal_id: portalId,
    field_key,
    field_value,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    const { error: upErr } = await app
      .from("application_responses")
      .upsert(rows, { onConflict: "candidate_in_portal_id,field_key" });
    if (upErr) throw new Error(`submit batch upsert failed: ${upErr.message}`);
  }

  // Flip submitted + advance to Stop 2 · Step 0 (Say hi).
  const { error: pErr } = await app
    .from("candidates_in_portal")
    .update({
      is_app_submitted: true,
      current_stop: 1,
      current_step: 0,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", portalId);
  if (pErr) throw new Error(`submit flag update failed: ${pErr.message}`);

  // Audit: log completion of explore/app.
  const { error: prErr } = await app.from("candidate_progress").insert({
    candidate_in_portal_id: portalId,
    stop_key: "explore",
    step_key: "app",
  });
  if (prErr) throw new Error(`candidate_progress insert failed: ${prErr.message}`);

  revalidatePath(`/portal/${token}`);
}

// ======================================================================
// Schedule content type — slot fetching, booking, cancellation
// ======================================================================

interface StepContext {
  stepId: string;
  stopKey: string;
  stepPosition: number;
  stopPosition: number;
  config: ScheduleConfig;
  portalId: string;
  candidate: {
    id: string;
    email: string;
    name: string;
  };
  brand: {
    id: string;
    name: string;
  };
  rep: {
    id: string;
    name: string;
    calendarEmail: string;
    role: string | null;
  } | null;
}

async function loadStepContext(
  token: string,
  stepId: string,
): Promise<StepContext> {
  const app = createAppServiceClient();
  const { data: session, error: sessErr } = await app
    .from("candidates_in_portal")
    .select("id, candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (sessErr) throw new Error(`session lookup failed: ${sessErr.message}`);
  if (!session) throw new Error("session not found");

  const { data: step, error: stepErr } = await app
    .from("steps_config")
    .select("id, brand_id, stop_key, position, content_type, config")
    .eq("id", stepId)
    .maybeSingle();
  if (stepErr) throw new Error(`step lookup failed: ${stepErr.message}`);
  if (!step) throw new Error("step not found");
  if (step.content_type !== "schedule") {
    throw new Error("step is not a schedule step");
  }

  const { data: stop, error: stopErr } = await app
    .from("stops_config")
    .select("position")
    .eq("brand_id", step.brand_id)
    .eq("stop_key", step.stop_key)
    .maybeSingle();
  if (stopErr) throw new Error(`stop lookup failed: ${stopErr.message}`);
  if (!stop) throw new Error("stop not found");

  const core = createCoreClient();
  const [{ data: candidate }, { data: brand }] = await Promise.all([
    core
      .from("candidates")
      .select("id, email, first_name, last_name, assigned_rep_id")
      .eq("id", session.candidate_id)
      .maybeSingle(),
    core
      .from("brands")
      .select("id, name")
      .eq("id", step.brand_id)
      .maybeSingle(),
  ]);
  if (!candidate) throw new Error("candidate not found");
  if (!brand) throw new Error("brand not found");

  // Resolve the assigned rep. Missing assignment is expected for brand-new
  // candidates — surface as rep=null so callers can show the "being
  // assigned" message instead of crashing.
  const assignedRepId =
    ((candidate as { assigned_rep_id?: string | null }).assigned_rep_id) ?? null;
  let rep: StepContext["rep"] = null;
  if (assignedRepId) {
    const { data: repRow, error: repErr } = await core
      .from("reps")
      .select("id, name, calendar_email, role, is_active")
      .eq("id", assignedRepId)
      .maybeSingle();
    if (repErr) throw new Error(`rep lookup failed: ${repErr.message}`);
    if (repRow && repRow.is_active !== false) {
      rep = {
        id: repRow.id as string,
        name: (repRow.name as string) ?? "",
        calendarEmail: (repRow.calendar_email as string) ?? "",
        role: (repRow.role as string | null) ?? null,
      };
    }
  }

  const rawConfig =
    step.config && typeof step.config === "object" && !Array.isArray(step.config)
      ? (step.config as Record<string, unknown>)
      : {};
  const config: ScheduleConfig = {
    duration_minutes:
      typeof rawConfig.duration_minutes === "number"
        ? rawConfig.duration_minutes
        : 30,
    days_ahead:
      typeof rawConfig.days_ahead === "number"
        ? Math.min(14, Math.max(1, rawConfig.days_ahead))
        : 14,
    start_hour:
      typeof rawConfig.start_hour === "number" ? rawConfig.start_hour : 9,
    end_hour:
      typeof rawConfig.end_hour === "number" ? rawConfig.end_hour : 17,
    timezone:
      typeof rawConfig.timezone === "string"
        ? rawConfig.timezone
        : "America/New_York",
    buffer_minutes:
      typeof rawConfig.buffer_minutes === "number"
        ? rawConfig.buffer_minutes
        : 15,
    body: typeof rawConfig.body === "string" ? rawConfig.body : undefined,
  };

  const name = [candidate.first_name, candidate.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || (candidate.email as string) || "Candidate";

  return {
    stepId: step.id as string,
    stopKey: step.stop_key as string,
    stepPosition: step.position as number,
    stopPosition: stop.position as number,
    config,
    portalId: session.id as string,
    candidate: {
      id: candidate.id as string,
      email: (candidate.email as string) ?? "",
      name,
    },
    brand: {
      id: brand.id as string,
      name: (brand.name as string) ?? "",
    },
    rep,
  };
}

export async function getAvailableSlotsAction(
  token: string,
  stepId: string,
): Promise<{ configured: boolean; slots: Slot[]; error?: string }> {
  try {
    const ctx = await loadStepContext(token, stepId);
    if (!ctx.rep) {
      return {
        configured: false,
        slots: [],
        error: "Your advisor is being assigned. Check back soon.",
      };
    }
    if (!isGCalConfigured()) {
      return { configured: false, slots: [] };
    }
    try {
      const slots = await getAvailableSlots(ctx.rep.calendarEmail, ctx.config);
      return { configured: true, slots };
    } catch (calErr) {
      // Calendar misconfigured (not shared with service account, revoked
      // scopes, etc.). Don't leak Google's internal message to candidates;
      // direct them to support.
      console.error("getAvailableSlots failed:", calErr);
      return {
        configured: false,
        slots: [],
        error:
          "Scheduling temporarily unavailable. Contact support@bmave.com.",
      };
    }
  } catch (e) {
    return {
      configured: false,
      slots: [],
      error: e instanceof Error ? e.message : "Failed to load slots",
    };
  }
}

export async function bookSlotAction(
  token: string,
  stepId: string,
  slotIso: string,
): Promise<{
  id: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
}> {
  const ctx = await loadStepContext(token, stepId);
  if (!ctx.rep) {
    throw new Error("Your advisor is being assigned. Check back soon.");
  }
  if (!isGCalConfigured()) {
    throw new Error(
      "Scheduling temporarily unavailable. Contact support@bmave.com.",
    );
  }
  if (!ctx.candidate.email) {
    throw new Error("Candidate has no email on file");
  }

  // Compute the end instant from the start + duration.
  const startMs = Date.parse(slotIso);
  if (!Number.isFinite(startMs)) throw new Error("Invalid slot");
  const endMs = startMs + ctx.config.duration_minutes * 60 * 1000;
  const endIso = new Date(endMs).toISOString();

  let result;
  try {
    result = await bookSlot({
      advisorEmail: ctx.rep.calendarEmail,
      candidateEmail: ctx.candidate.email,
      candidateName: ctx.candidate.name,
      brandName: ctx.brand.name,
      startIso: new Date(startMs).toISOString(),
      endIso,
      timezone: ctx.config.timezone,
    });
  } catch (calErr) {
    console.error("bookSlot failed:", calErr);
    throw new Error(
      "Scheduling temporarily unavailable. Contact support@bmave.com.",
    );
  }

  const app = createAppServiceClient();

  // Upsert the booking row — one per (candidate, step) thanks to the unique
  // constraint. If the candidate is rescheduling, we should have deleted the
  // prior row via cancelBookingAction first; defensively `upsert` here so we
  // tolerate races.
  const { data: bookingRow, error: insErr } = await app
    .from("bookings")
    .upsert(
      {
        candidate_in_portal_id: ctx.portalId,
        step_id: ctx.stepId,
        google_event_id: result.eventId,
        meeting_url: result.meetingUrl,
        start_time: result.startTime,
        end_time: result.endTime,
        status: "confirmed",
      },
      { onConflict: "candidate_in_portal_id,step_id" },
    )
    .select("id")
    .single();
  if (insErr) throw new Error(`booking insert failed: ${insErr.message}`);

  // Progress: log completion of this step and advance the candidate to
  // whichever step comes next within the same stop.
  await app.from("candidate_progress").insert({
    candidate_in_portal_id: ctx.portalId,
    stop_key: ctx.stopKey,
    step_key: null,
  });
  await app
    .from("candidates_in_portal")
    .update({
      // Advance past this step by position+1. The portal page will clamp
      // this to the actual step count on next render.
      current_step: ctx.stepPosition + 1,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", ctx.portalId);

  revalidatePath(`/portal/${token}`);

  return {
    id: bookingRow.id as string,
    start_time: result.startTime,
    end_time: result.endTime,
    meeting_url: result.meetingUrl,
  };
}

export async function cancelBookingAction(
  token: string,
  bookingId: string,
): Promise<void> {
  const app = createAppServiceClient();

  const { data: booking, error: readErr } = await app
    .from("bookings")
    .select(
      "id, google_event_id, step_id, candidate_in_portal_id, status",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr) throw new Error(`booking lookup failed: ${readErr.message}`);
  if (!booking) throw new Error("booking not found");
  if (booking.status === "cancelled") return;

  // Verify the booking belongs to the session on this token — defense in
  // depth against client-supplied ids.
  const { data: session } = await app
    .from("candidates_in_portal")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (!session || session.id !== booking.candidate_in_portal_id) {
    throw new Error("booking does not belong to this session");
  }

  // Resolve the rep whose calendar owns this event, via the candidate's
  // current assignment. The candidate's rep may have changed since the
  // event was booked — rare in demo, but if it happens we bail out of the
  // Google cancel step and still clear the local booking row so the UX
  // doesn't get stuck.
  let repCalendarEmail: string | null = null;
  const { data: sessionRow } = await app
    .from("candidates_in_portal")
    .select("candidate_id")
    .eq("id", booking.candidate_in_portal_id)
    .maybeSingle();
  if (sessionRow?.candidate_id) {
    const core = createCoreClient();
    const { data: cand } = await core
      .from("candidates")
      .select("assigned_rep_id")
      .eq("id", sessionRow.candidate_id)
      .maybeSingle();
    const assignedRepId =
      ((cand as { assigned_rep_id?: string | null } | null)?.assigned_rep_id) ?? null;
    if (assignedRepId) {
      const { data: rep } = await core
        .from("reps")
        .select("calendar_email")
        .eq("id", assignedRepId)
        .maybeSingle();
      repCalendarEmail =
        ((rep as { calendar_email?: string | null } | null)?.calendar_email) ?? null;
    }
  }

  if (repCalendarEmail && isGCalConfigured()) {
    try {
      await cancelSlot(repCalendarEmail, booking.google_event_id);
    } catch (calErr) {
      // Log but don't block the local cleanup — the user can re-pick a
      // slot even if Google's side is stale.
      console.error("cancelSlot failed (continuing with local delete):", calErr);
    }
  }

  // Hard-delete the booking row so the renderer flips back to "not booked"
  // and the unique (candidate, step) constraint frees up for a reschedule.
  const { error: delErr } = await app
    .from("bookings")
    .delete()
    .eq("id", booking.id);
  if (delErr) throw new Error(`booking delete failed: ${delErr.message}`);

  revalidatePath(`/portal/${token}`);
}
