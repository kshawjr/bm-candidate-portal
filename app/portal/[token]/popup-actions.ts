"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { logEvent } from "@/lib/log-event";

/**
 * Append a chapter_key to the candidate's dismissed_chapter_videos array.
 * Called once per chapter, from the chapter video popup's dismiss button.
 * Same read-modify-write pattern as the chapter intro / step transition
 * dismissals — dedupes if somehow called twice for the same chapter.
 *
 * Replaces the old dismissWelcomePopup (PR 31) which set a single boolean;
 * the per-chapter array supports the generalized chapter video model.
 */
export async function dismissChapterVideo(
  token: string,
  chapterKey: string,
): Promise<{ success: boolean }> {
  if (!chapterKey || typeof chapterKey !== "string") {
    return { success: false };
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("candidates_in_portal")
    .select("id, dismissed_chapter_videos")
    .eq("token", token)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false };
  }

  const existing: unknown = row.dismissed_chapter_videos;
  const list: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  if (list.includes(chapterKey)) {
    await app
      .from("candidates_in_portal")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", row.id);
    return { success: true };
  }

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      dismissed_chapter_videos: [...list, chapterKey],
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    return { success: false };
  }
  revalidatePath(`/portal/${token}`);
  return { success: true };
}

/**
 * Record that the candidate has dismissed the intro popup for a specific
 * chapter. Reads the current dismissed_chapter_intros array, appends the key
 * if it isn't already there, and writes back.
 *
 * Read-modify-write is fine here because the candidate dismisses each chapter
 * intro at most a handful of times per portal session — no contention to
 * worry about. If the same candidate somehow fires this twice, the dedupe
 * keeps the array clean.
 */
export async function dismissChapterIntro(
  token: string,
  chapterKey: string,
): Promise<{ success: boolean }> {
  if (!chapterKey || typeof chapterKey !== "string") {
    return { success: false };
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("candidates_in_portal")
    .select("id, dismissed_chapter_intros")
    .eq("token", token)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false };
  }

  const existing: unknown = row.dismissed_chapter_intros;
  const list: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  if (list.includes(chapterKey)) {
    // Already dismissed — no DB write needed, just bump activity.
    await app
      .from("candidates_in_portal")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", row.id);
    return { success: true };
  }

  const next = [...list, chapterKey];
  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      dismissed_chapter_intros: next,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    return { success: false };
  }
  revalidatePath(`/portal/${token}`);
  return { success: true };
}

/**
 * Dismiss a chapter complete popup AND advance the candidate to the next
 * chapter. The two are bundled in one server action because the popup IS
 * the gate for advancement — finishing the last step of a chapter sets
 * current_step past the end, the popup fires, and dismissing it bumps
 * current_chapter forward.
 *
 * For the final chapter we still record the dismissal but don't advance
 * past the last index (the candidate stays on the final chapter forever).
 */
export async function completeChapterAndAdvance(
  token: string,
  chapterKey: string,
): Promise<{ success: boolean }> {
  if (!chapterKey || typeof chapterKey !== "string") {
    return { success: false };
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("candidates_in_portal")
    .select(
      "id, candidate_id, current_chapter, dismissed_chapter_completes",
    )
    .eq("token", token)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false };
  }

  // Resolve the brand so we can count active chapters and clamp the next
  // current_chapter — a per-portal reach into bmave-core, but we already do
  // this on the page so the round-trip cost is amortized by Supabase
  // connection pooling.
  const core = createCoreClient();
  const { data: candidate } = await core
    .from("candidates")
    .select("brand_id")
    .eq("id", row.candidate_id)
    .maybeSingle();
  const brandId = (candidate as { brand_id?: string } | null)?.brand_id;
  if (!brandId) {
    return { success: false };
  }

  const { data: chapterRows } = await app
    .from("chapters_config")
    .select("chapter_key, position")
    .eq("brand_id", brandId)
    .eq("is_archived", false)
    .order("position");
  const chapters = chapterRows ?? [];
  const lastIdx = chapters.length - 1;

  // Find the index of the chapter the candidate just finished (by key) so
  // the bump is robust to admin reordering between page render and click.
  const finishedIdx = chapters.findIndex(
    (c) => c.chapter_key === chapterKey,
  );
  // Bump current_chapter to finishedIdx + 1, clamped to the last index.
  // If the chapterKey is gone (admin deleted it mid-flight), advance from
  // current_chapter as a fallback so we still make forward progress.
  const baseIdx =
    finishedIdx >= 0 ? finishedIdx : (row.current_chapter as number) ?? 0;
  const nextChapterIdx = Math.min(baseIdx + 1, lastIdx);

  const existing: unknown = row.dismissed_chapter_completes;
  const list: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const dismissals = list.includes(chapterKey)
    ? list
    : [...list, chapterKey];

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      dismissed_chapter_completes: dismissals,
      current_chapter: nextChapterIdx,
      current_step: 0,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    return { success: false };
  }

  // Fire tracking events. The chapter-complete popup is a different
  // signal from intent-to-apply, so 'chapter_completed' (engagement)
  // belongs here. The 'education_completed' milestone moved to
  // completeTourAction (PR 57) — it fires the moment the candidate
  // advances past the tour into the application, which is the natural
  // sales-team handoff point. nextChapterIdx > finishedIdx ensures we
  // only fire verify_started on actual forward motion, not on a
  // redundant dismiss call after the candidate is already past verify.
  await logEvent({
    candidateId: row.candidate_id as string,
    brandId,
    category: "engagement",
    eventType: "chapter_completed",
    eventKey: chapterKey,
    metadata: { next_chapter_idx: nextChapterIdx },
  });
  const enteringChapterKey = chapters[nextChapterIdx]?.chapter_key;
  if (enteringChapterKey === "verify" && nextChapterIdx > finishedIdx) {
    await logEvent({
      candidateId: row.candidate_id as string,
      brandId,
      category: "milestone",
      eventType: "verify_started",
      eventKey: enteringChapterKey,
    });
  }

  revalidatePath(`/portal/${token}`);
  return { success: true };
}

/**
 * Append a step_id to the candidate's dismissed_step_transitions array.
 * Mirrors dismissChapterIntro: read-modify-write with dedupe. No
 * revalidation here — transition popups are high-frequency and we don't
 * want to thrash the page on every dismissal. The next page navigation
 * picks up the fresh array.
 */
export async function dismissStepTransition(
  token: string,
  stepId: string,
): Promise<{ success: boolean }> {
  if (!stepId || typeof stepId !== "string") {
    return { success: false };
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("candidates_in_portal")
    .select("id, dismissed_step_transitions")
    .eq("token", token)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false };
  }

  const existing: unknown = row.dismissed_step_transitions;
  const list: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  if (list.includes(stepId)) {
    await app
      .from("candidates_in_portal")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", row.id);
    return { success: true };
  }

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      dismissed_step_transitions: [...list, stepId],
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) {
    return { success: false };
  }
  return { success: true };
}

/**
 * Mirror of dismissStepTransition for the new step transition VIDEO
 * sequence. Appends to dismissed_step_transition_videos so the next
 * render of the step doesn't replay the video. Same no-revalidation
 * pattern — these fire often (potentially once per step) and we don't
 * want to thrash the page tree on every dismiss.
 */
export async function dismissStepTransitionVideo(
  token: string,
  stepId: string,
): Promise<{ success: boolean }> {
  if (!stepId || typeof stepId !== "string") {
    return { success: false };
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("candidates_in_portal")
    .select("id, dismissed_step_transition_videos, last_visited_step_id")
    .eq("token", token)
    .maybeSingle();
  if (readErr || !row) {
    return { success: false };
  }

  const existing: unknown = row.dismissed_step_transition_videos;
  const list: string[] = Array.isArray(existing)
    ? (existing as unknown[]).filter((v): v is string => typeof v === "string")
    : [];

  // Clear last_visited_step_id only when it matches the step being
  // dismissed — a concurrent advance in another tab may have already
  // rotated it to a newer departure, and we don't want to clobber
  // that. The clear here prevents a hard refresh from re-firing the
  // same video the candidate just dismissed.
  const shouldClearLastVisited = row.last_visited_step_id === stepId;

  if (list.includes(stepId)) {
    await app
      .from("candidates_in_portal")
      .update({
        last_activity_at: new Date().toISOString(),
        ...(shouldClearLastVisited ? { last_visited_step_id: null } : {}),
      })
      .eq("id", row.id);
    return { success: true };
  }

  const { error: updErr } = await app
    .from("candidates_in_portal")
    .update({
      dismissed_step_transition_videos: [...list, stepId],
      last_activity_at: new Date().toISOString(),
      ...(shouldClearLastVisited ? { last_visited_step_id: null } : {}),
    })
    .eq("id", row.id);
  if (updErr) {
    return { success: false };
  }
  return { success: true };
}
