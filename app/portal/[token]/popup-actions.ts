"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";

/**
 * Mark the welcome popup as seen for the candidate behind this token.
 * Called once, from the welcome popup's dismiss button. Sets the boolean
 * flag and bumps last_activity_at so the journey card stays fresh.
 */
export async function dismissWelcomePopup(
  token: string,
): Promise<{ success: boolean }> {
  const app = createAppServiceClient();
  const { error } = await app
    .from("candidates_in_portal")
    .update({
      has_seen_welcome: true,
      last_activity_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) {
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
