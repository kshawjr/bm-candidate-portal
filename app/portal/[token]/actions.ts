"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { logEvent } from "@/lib/log-event";
import {
  bookSlot,
  cancelSlot,
  getAvailableSlots,
  isGCalConfigured,
  type ScheduleConfig,
  type Slot,
} from "@/lib/google-calendar";

/**
 * Resolve the (candidate_id, brand_id) pair from a portal token. Used by
 * tracking call sites that only have the token but need both ids to call
 * `logEvent`. Returns null on miss so callers can swallow tracking
 * failures rather than blowing up the user-facing action.
 */
async function resolveCandidateAndBrand(
  token: string,
): Promise<{ candidateId: string; brandId: string } | null> {
  const app = createAppServiceClient();
  const { data: session } = await app
    .from("candidates_in_portal")
    .select("candidate_id")
    .eq("token", token)
    .maybeSingle();
  if (!session?.candidate_id) return null;
  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("brand_id")
    .eq("id", session.candidate_id as string)
    .maybeSingle();
  if (!candidate?.brand_id) return null;
  return {
    candidateId: session.candidate_id as string,
    brandId: candidate.brand_id as string,
  };
}

/**
 * Generic "advance the candidate past the step they just finished" — bumps
 * current_step only, no chapter-wide flags. Used by video and schedule steps.
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
 * nextStepIdx based on how many steps exist in the current chapter, so this
 * action doesn't need to re-derive it.
 *
 * PR 57: also fires the `education_completed` milestone when the tour
 * being completed lives in the Explore chapter. This is the natural
 * sales-team handoff point ("watched the tour, now considering the
 * application"), and the trigger moved here from the chapter-complete
 * popup dismiss so the milestone fires at the moment intent is shown,
 * not several screens later. Idempotent — only fires once per candidate.
 */
export async function completeTourAction(
  token: string,
  nextStepIdx: number,
  chapterKey: string,
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

  // Diagnostic logging left in place after PR 58 — the events table
  // showed this trigger never fired in production, and the fix turned
  // out to be elsewhere (resetCandidateAction wasn't clearing
  // candidate_events, so the dedup blocked every test rerun). The logs
  // stay so future "milestone X isn't firing" debugging is one log
  // search away rather than a code archeology project.
  console.log(
    `[completeTourAction] token=${token} chapterKey=${chapterKey} nextStepIdx=${nextStepIdx}`,
  );
  if (chapterKey === "explore") {
    const ctx = await resolveCandidateAndBrand(token);
    console.log(
      `[completeTourAction] resolved ctx: ${ctx ? `candidate=${ctx.candidateId} brand=${ctx.brandId}` : "null"}`,
    );
    if (ctx) {
      // Dedup against the events table itself rather than a flag on
      // candidates_in_portal so a reset flow can't unintentionally
      // re-fire the Blueprint transition. Race-safe enough: this fires
      // from a single user click, never in parallel.
      const { data: existing } = await app
        .from("candidate_events")
        .select("id")
        .eq("candidate_id", ctx.candidateId)
        .eq("event_type", "education_completed")
        .limit(1)
        .maybeSingle();
      console.log(
        `[completeTourAction] existing education_completed: ${existing ? `id=${existing.id}` : "none"}`,
      );
      if (!existing) {
        console.log("[completeTourAction] firing education_completed");
        await logEvent({
          candidateId: ctx.candidateId,
          brandId: ctx.brandId,
          category: "milestone",
          eventType: "education_completed",
          eventKey: chapterKey,
          metadata: { trigger: "tour_advance" },
        });
        console.log("[completeTourAction] education_completed fire complete");
      } else {
        console.log("[completeTourAction] skipped — existing event blocks dedup");
      }
    }
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
 * is_app_submitted, and bumps current_step PAST the last step of Chapter 1
 * (the page clamps to the actual count) — leaving current_chapter alone.
 *
 * Chapter advancement happens later, when the candidate dismisses the
 * Chapter Complete popup (PR 36). The "past last step" sentinel is what
 * tells the page to fire that popup on next render.
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

  // Flip submitted + push current_step past the last step of Chapter 1.
  // 99 is a "past the end" sentinel — page clamps to the real step count
  // (which is robust to admins adding/removing steps from Chapter 1).
  const { error: pErr } = await app
    .from("candidates_in_portal")
    .update({
      is_app_submitted: true,
      current_step: 99,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", portalId);
  if (pErr) throw new Error(`submit flag update failed: ${pErr.message}`);

  // Audit: log completion of explore/app.
  const { error: prErr } = await app.from("candidate_progress").insert({
    candidate_in_portal_id: portalId,
    chapter_key: "explore",
    step_key: "app",
  });
  if (prErr) throw new Error(`candidate_progress insert failed: ${prErr.message}`);

  const ctx = await resolveCandidateAndBrand(token);
  if (ctx) {
    await logEvent({
      candidateId: ctx.candidateId,
      brandId: ctx.brandId,
      category: "milestone",
      eventType: "application_submitted",
      eventKey: "app",
      metadata: { completion_percent: 100, section_count: 7 },
    });
    await logEvent({
      candidateId: ctx.candidateId,
      brandId: ctx.brandId,
      category: "engagement",
      eventType: "step_completed",
      eventKey: "app",
      metadata: { chapter_key: "explore" },
    });
  }

  revalidatePath(`/portal/${token}`);
}

// ======================================================================
// Schedule content type — slot fetching, booking, cancellation
// ======================================================================

interface StepContext {
  stepId: string;
  chapterKey: string;
  stepPosition: number;
  chapterPosition: number;
  config: ScheduleConfig;
  portalId: string;
  candidate: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
  };
  brand: {
    id: string;
    name: string;
    shortName: string;
  };
  rep: {
    id: string;
    name: string;
    calendarEmail: string;
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
    .select("id, brand_id, chapter_key, position, content_type, config")
    .eq("id", stepId)
    .maybeSingle();
  if (stepErr) throw new Error(`step lookup failed: ${stepErr.message}`);
  if (!step) throw new Error("step not found");
  if (step.content_type !== "schedule") {
    throw new Error("step is not a schedule step");
  }

  const { data: chapter, error: chapterErr } = await app
    .from("chapters_config")
    .select("position")
    .eq("brand_id", step.brand_id)
    .eq("chapter_key", step.chapter_key)
    .maybeSingle();
  if (chapterErr) throw new Error(`chapter lookup failed: ${chapterErr.message}`);
  if (!chapter) throw new Error("chapter not found");

  const core = createCoreClient();
  const [{ data: candidate }, { data: brand }] = await Promise.all([
    core
      .from("candidates")
      .select("id, email, first_name, last_name, phone, assigned_rep_id")
      .eq("id", session.candidate_id)
      .maybeSingle(),
    core
      .from("brands")
      .select("id, name, short_name")
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
      .select("id, name, calendar_email, is_active")
      .eq("id", assignedRepId)
      .maybeSingle();
    if (repErr) throw new Error(`rep lookup failed: ${repErr.message}`);
    if (repRow && repRow.is_active !== false) {
      rep = {
        id: repRow.id as string,
        name: (repRow.name as string) ?? "",
        calendarEmail: (repRow.calendar_email as string) ?? "",
      };
    }
  }

  const rawConfig =
    step.config && typeof step.config === "object" && !Array.isArray(step.config)
      ? (step.config as Record<string, unknown>)
      : {};
  const workingDaysRaw = Array.isArray(rawConfig.working_days)
    ? (rawConfig.working_days as unknown[]).filter(
        (n): n is number =>
          typeof n === "number" && n >= 0 && n <= 6 && Number.isInteger(n),
      )
    : null;

  const config: ScheduleConfig = {
    duration_minutes:
      typeof rawConfig.duration_minutes === "number"
        ? rawConfig.duration_minutes
        : 60,
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
    event_label:
      typeof rawConfig.event_label === "string" &&
      rawConfig.event_label.trim().length > 0
        ? rawConfig.event_label.trim()
        : "Discovery Call",
    working_days:
      workingDaysRaw && workingDaysRaw.length > 0
        ? workingDaysRaw
        : [1, 2, 3, 4, 5],
    min_notice_hours:
      typeof rawConfig.min_notice_hours === "number"
        ? rawConfig.min_notice_hours
        : 24,
  };

  const name = [candidate.first_name, candidate.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || (candidate.email as string) || "Candidate";

  const brandFullName = (brand.name as string) ?? "";
  const brandShort =
    ((brand as { short_name?: string | null }).short_name ?? "").trim() ||
    brandFullName;

  return {
    stepId: step.id as string,
    chapterKey: step.chapter_key as string,
    stepPosition: step.position as number,
    chapterPosition: chapter.position as number,
    config,
    portalId: session.id as string,
    candidate: {
      id: candidate.id as string,
      email: (candidate.email as string) ?? "",
      name,
      phone: ((candidate as { phone?: string | null }).phone) ?? null,
    },
    brand: {
      id: brand.id as string,
      name: brandFullName,
      shortName: brandShort,
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
      candidatePhone: ctx.candidate.phone,
      brandShortName: ctx.brand.shortName,
      eventLabel: ctx.config.event_label,
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
  // tolerate races. rep_id mirrors bmave-core.reps.id so cancellation can
  // resolve the right calendar even if the candidate gets reassigned later.
  const { data: bookingRow, error: insErr } = await app
    .from("bookings")
    .upsert(
      {
        candidate_in_portal_id: ctx.portalId,
        step_id: ctx.stepId,
        rep_id: ctx.rep.id,
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

  // Progress: log completion of this step.
  await app.from("candidate_progress").insert({
    candidate_in_portal_id: ctx.portalId,
    chapter_key: ctx.chapterKey,
    step_key: null,
  });

  await logEvent({
    candidateId: ctx.candidate.id,
    brandId: ctx.brand.id,
    category: "milestone",
    eventType: "discovery_scheduled",
    eventKey: ctx.chapterKey,
    metadata: {
      booked_for: result.startTime,
      duration_minutes: ctx.config.duration_minutes,
      step_id: ctx.stepId,
    },
  });
  await logEvent({
    candidateId: ctx.candidate.id,
    brandId: ctx.brand.id,
    category: "engagement",
    eventType: "step_completed",
    eventKey: ctx.stepId,
    metadata: { chapter_key: ctx.chapterKey },
  });

  // PR 44: when this booking finishes the LAST active step of the
  // chapter (e.g., Chapter 2's lone schedule step), auto-advance
  // current_chapter past it. The booking confirmation screen IS the
  // celebration moment — no need to also fire the chapter complete
  // popup here, so we mark it dismissed.
  //
  // For non-last-step bookings, fall back to the existing per-step
  // advance behaviour.
  const { count: activeStepCount } = await app
    .from("steps_config")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", ctx.brand.id)
    .eq("chapter_key", ctx.chapterKey)
    .eq("is_archived", false);
  const wasLastStep =
    typeof activeStepCount === "number" &&
    ctx.stepPosition + 1 >= activeStepCount;

  if (wasLastStep) {
    // Find the candidate's current chapter index from the active chapter
    // ordering for this brand, plus the dismissed array to dedupe.
    const [{ data: chapterRows }, { data: sessionRow }] = await Promise.all([
      app
        .from("chapters_config")
        .select("chapter_key, position")
        .eq("brand_id", ctx.brand.id)
        .eq("is_archived", false)
        .order("position"),
      app
        .from("candidates_in_portal")
        .select("dismissed_chapter_completes")
        .eq("id", ctx.portalId)
        .maybeSingle(),
    ]);
    const chapters = chapterRows ?? [];
    const lastIdx = Math.max(0, chapters.length - 1);
    const finishedIdx = chapters.findIndex(
      (c) => c.chapter_key === ctx.chapterKey,
    );
    const nextChapterIdx = Math.min(
      Math.max(0, finishedIdx) + 1,
      lastIdx,
    );
    const existingDismissals: unknown =
      sessionRow?.dismissed_chapter_completes;
    const dismissed: string[] = Array.isArray(existingDismissals)
      ? (existingDismissals as unknown[]).filter(
          (v): v is string => typeof v === "string",
        )
      : [];
    const nextDismissals = dismissed.includes(ctx.chapterKey)
      ? dismissed
      : [...dismissed, ctx.chapterKey];

    await app
      .from("candidates_in_portal")
      .update({
        current_chapter: nextChapterIdx,
        current_step: 0,
        dismissed_chapter_completes: nextDismissals,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", ctx.portalId);
  } else {
    await app
      .from("candidates_in_portal")
      .update({
        // Advance past this step by position+1. The portal page will clamp
        // this to the actual step count on next render.
        current_step: ctx.stepPosition + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", ctx.portalId);
  }

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
      "id, google_event_id, step_id, candidate_in_portal_id, rep_id, status",
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

  // Resolve the rep whose calendar owns this event via the booking's own
  // rep_id — not the candidate's current assignment, which may have moved
  // since the booking was made.
  let repCalendarEmail: string | null = null;
  if (booking.rep_id) {
    const core = createCoreClient();
    const { data: rep } = await core
      .from("reps")
      .select("calendar_email")
      .eq("id", booking.rep_id)
      .maybeSingle();
    repCalendarEmail =
      ((rep as { calendar_email?: string | null } | null)?.calendar_email) ?? null;
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

  const trackingCtx = await resolveCandidateAndBrand(token);
  if (trackingCtx) {
    await logEvent({
      candidateId: trackingCtx.candidateId,
      brandId: trackingCtx.brandId,
      category: "action",
      eventType: "booking_cancelled",
      eventKey: booking.step_id as string,
      metadata: { booking_id: booking.id as string },
    });
  }

  revalidatePath(`/portal/${token}`);
}
