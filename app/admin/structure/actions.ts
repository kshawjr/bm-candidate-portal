"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { getAdminUser } from "@/lib/supabase-auth";
import {
  getCandidatesOnStep,
  getCandidatesOnChapter,
  type CandidateOnJourney,
} from "@/lib/candidate-guards";

export type ContentType =
  | "slides"
  | "static"
  | "application"
  | "schedule"
  | "video"
  | "call_prep"
  | "document"
  | "checklist";

export interface ChapterFormData {
  chapter_key: string;
  label: string;
  name: string;
  icon: string | null;
  description: string | null;
}

export interface StepFormData {
  step_key: string;
  label: string;
  description: string | null;
  content_type: ContentType;
}

async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("Not authorized");
  return user;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function validateKey(key: string, kind: "chapter_key" | "step_key") {
  if (!key || !KEY_PATTERN.test(key)) {
    throw new Error(
      `${kind} must be lowercase letters/numbers/underscores and start with a letter`,
    );
  }
}

function bumpCaches() {
  revalidatePath("/admin/structure");
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

function defaultConfigForType(type: ContentType): Record<string, unknown> {
  if (type === "slides") {
    return {
      slides: [
        {
          id: `slide-${Date.now()}`,
          image_url:
            "https://placehold.co/1600x900/cccccc/666666?text=Slide+1",
          alt: null,
          caption: null,
        },
      ],
    };
  }
  if (type === "static") {
    return { body: "Edit this content in the admin." };
  }
  if (type === "video") {
    return {
      source: "youtube",
      url: "",
      title: "",
      body: "",
      cta_label: "",
    };
  }
  if (type === "schedule") {
    return {
      duration_minutes: 60,
      days_ahead: 14,
      start_hour: 9,
      end_hour: 17,
      timezone: "America/New_York",
      buffer_minutes: 15,
      body: "",
      event_label: "Discovery Call",
      working_days: [1, 2, 3, 4, 5],
      min_notice_hours: 24,
    };
  }
  if (type === "call_prep") {
    return {
      linked_schedule_step_id: null,
      heading: "Before your {call_type}",
      subheading: "What to expect",
      description:
        "A quick read so nothing feels like a cold open. This is a {duration}-minute conversation with {rep_first_name} from the {brand_short_name} team.",
      hero_image_url: null,
      what_well_cover: [
        "Your timeline and what you're looking for",
        "How {brand_short_name} actually works day-to-day",
        "Whatever questions are top of mind for you",
      ],
      come_prepared: [
        "Jot down any questions about the brand or operations",
        "Think about what 'good' looks like for you in a franchise",
      ],
      partner_callout_enabled: true,
      partner_callout_text:
        "If you have a spouse, partner, or co-investor — bring them along. {call_type} calls are way better with the whole team.",
      cta_label: "Ready to book",
    };
  }
  // application + any other type → empty config
  return {};
}

// ======================================================================
// CHAPTERS
// ======================================================================

export async function createChapterAction(
  brandId: string,
  data: ChapterFormData,
): Promise<void> {
  await requireAdmin();
  validateKey(data.chapter_key, "chapter_key");
  if (!data.label.trim()) throw new Error("Label is required");
  if (!data.name.trim()) throw new Error("Name is required");

  const app = createAppServiceClient();

  const { data: existing, error: readErr } = await app
    .from("chapters_config")
    .select("position")
    .eq("brand_id", brandId)
    .order("position", { ascending: false })
    .limit(1);
  if (readErr) throw new Error(`chapters lookup failed: ${readErr.message}`);
  const nextPosition =
    existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0;

  const { error } = await app.from("chapters_config").insert({
    brand_id: brandId,
    chapter_key: data.chapter_key,
    position: nextPosition,
    label: data.label.trim(),
    name: data.name.trim(),
    icon: data.icon?.trim() || null,
    description: data.description?.trim() || null,
    content: {},
    is_archived: false,
  });
  if (error) throw new Error(`chapters_config insert failed: ${error.message}`);

  bumpCaches();
}

export async function updateChapterAction(
  chapterId: string,
  data: Omit<ChapterFormData, "chapter_key">,
): Promise<void> {
  await requireAdmin();
  if (!data.label.trim()) throw new Error("Label is required");
  if (!data.name.trim()) throw new Error("Name is required");

  const app = createAppServiceClient();
  const { error } = await app
    .from("chapters_config")
    .update({
      label: data.label.trim(),
      name: data.name.trim(),
      icon: data.icon?.trim() || null,
      description: data.description?.trim() || null,
    })
    .eq("id", chapterId);
  if (error) throw new Error(`chapters_config update failed: ${error.message}`);

  bumpCaches();
}

export async function deleteChapterAction(chapterId: string): Promise<void> {
  await requireAdmin();
  const app = createAppServiceClient();

  const { data: chapter, error: chapterErr } = await app
    .from("chapters_config")
    .select("id, brand_id, chapter_key")
    .eq("id", chapterId)
    .maybeSingle();
  if (chapterErr) throw new Error(`chapter lookup failed: ${chapterErr.message}`);
  if (!chapter) throw new Error("Chapter not found");

  const { count: stepCount, error: stepsErr } = await app
    .from("steps_config")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", chapter.brand_id)
    .eq("chapter_key", chapter.chapter_key);
  if (stepsErr) throw new Error(`steps count failed: ${stepsErr.message}`);
  if ((stepCount ?? 0) > 0) {
    throw new Error("Delete the steps inside this chapter first.");
  }

  const candidates = await getCandidatesOnChapter(chapter.chapter_key, chapter.brand_id);
  if (candidates.length > 0) {
    throw new Error(
      `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} currently at this chapter. Move them first or archive the chapter instead.`,
    );
  }

  const { error } = await app.from("chapters_config").delete().eq("id", chapterId);
  if (error) throw new Error(`chapters_config delete failed: ${error.message}`);

  bumpCaches();
}

export async function archiveChapterAction(
  chapterId: string,
  archived: boolean,
): Promise<void> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("chapters_config")
    .update({ is_archived: archived })
    .eq("id", chapterId);
  if (error)
    throw new Error(`chapters_config archive toggle failed: ${error.message}`);
  bumpCaches();
}

export async function reorderChaptersAction(
  brandId: string,
  orderedChapterIds: string[],
): Promise<void> {
  await requireAdmin();
  const app = createAppServiceClient();

  // Two-phase write so the (brand_id, chapter_key) unique constraint on
  // position doesn't trip mid-flight if positions ever become unique. Not
  // currently constrained, but cheap insurance.
  const offset = orderedChapterIds.length + 1000;
  for (let i = 0; i < orderedChapterIds.length; i++) {
    const { error } = await app
      .from("chapters_config")
      .update({ position: offset + i })
      .eq("id", orderedChapterIds[i])
      .eq("brand_id", brandId);
    if (error) throw new Error(`reorder phase 1 failed: ${error.message}`);
  }
  for (let i = 0; i < orderedChapterIds.length; i++) {
    const { error } = await app
      .from("chapters_config")
      .update({ position: i })
      .eq("id", orderedChapterIds[i])
      .eq("brand_id", brandId);
    if (error) throw new Error(`reorder phase 2 failed: ${error.message}`);
  }

  bumpCaches();
}

// ======================================================================
// STEPS
// ======================================================================

export async function createStepAction(
  brandId: string,
  chapterKey: string,
  data: StepFormData,
): Promise<string> {
  await requireAdmin();
  validateKey(data.step_key, "step_key");
  if (!data.label.trim()) throw new Error("Label is required");

  const app = createAppServiceClient();

  const { data: existing, error: readErr } = await app
    .from("steps_config")
    .select("position")
    .eq("brand_id", brandId)
    .eq("chapter_key", chapterKey)
    .order("position", { ascending: false })
    .limit(1);
  if (readErr) throw new Error(`steps lookup failed: ${readErr.message}`);
  const nextPosition =
    existing && existing.length > 0 ? (existing[0].position as number) + 1 : 0;

  const insert = {
    brand_id: brandId,
    chapter_key: chapterKey,
    position: nextPosition,
    step_key: data.step_key,
    label: data.label.trim(),
    description: data.description?.trim() || null,
    content_type: data.content_type,
    config: defaultConfigForType(data.content_type),
    content_cards: [],
    is_archived: false,
  };
  const { data: inserted, error } = await app
    .from("steps_config")
    .insert(insert)
    .select("id")
    .single();
  if (error) throw new Error(`steps_config insert failed: ${error.message}`);

  bumpCaches();
  return inserted.id as string;
}

export async function updateStepAction(
  stepId: string,
  data: Omit<StepFormData, "step_key"> & { confirmTypeReset?: boolean },
): Promise<void> {
  await requireAdmin();
  if (!data.label.trim()) throw new Error("Label is required");

  const app = createAppServiceClient();
  const { data: existing, error: readErr } = await app
    .from("steps_config")
    .select("content_type")
    .eq("id", stepId)
    .maybeSingle();
  if (readErr) throw new Error(`step lookup failed: ${readErr.message}`);
  if (!existing) throw new Error("Step not found");

  const typeChanged = existing.content_type !== data.content_type;
  if (typeChanged && !data.confirmTypeReset) {
    throw new Error(
      "Content type change requires confirmation. Existing content will be reset.",
    );
  }

  const update: Record<string, unknown> = {
    label: data.label.trim(),
    description: data.description?.trim() || null,
    content_type: data.content_type,
  };
  if (typeChanged) {
    update.config = defaultConfigForType(data.content_type);
    update.content_cards = [];
  }

  const { error } = await app
    .from("steps_config")
    .update(update)
    .eq("id", stepId);
  if (error) throw new Error(`steps_config update failed: ${error.message}`);

  bumpCaches();
}

export async function deleteStepAction(stepId: string): Promise<void> {
  await requireAdmin();

  const candidates = await getCandidatesOnStep(stepId);
  if (candidates.length > 0) {
    throw new Error(
      `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} currently on this step. Move them first or archive the step instead.`,
    );
  }

  const app = createAppServiceClient();
  const { error } = await app.from("steps_config").delete().eq("id", stepId);
  if (error) throw new Error(`steps_config delete failed: ${error.message}`);

  bumpCaches();
}

export async function archiveStepAction(
  stepId: string,
  archived: boolean,
): Promise<void> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("steps_config")
    .update({ is_archived: archived })
    .eq("id", stepId);
  if (error)
    throw new Error(`steps_config archive toggle failed: ${error.message}`);
  bumpCaches();
}

export async function reorderStepsAction(
  brandId: string,
  chapterKey: string,
  orderedStepIds: string[],
): Promise<void> {
  await requireAdmin();
  const app = createAppServiceClient();

  const offset = orderedStepIds.length + 1000;
  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await app
      .from("steps_config")
      .update({ position: offset + i })
      .eq("id", orderedStepIds[i])
      .eq("brand_id", brandId)
      .eq("chapter_key", chapterKey);
    if (error) throw new Error(`reorder phase 1 failed: ${error.message}`);
  }
  for (let i = 0; i < orderedStepIds.length; i++) {
    const { error } = await app
      .from("steps_config")
      .update({ position: i })
      .eq("id", orderedStepIds[i])
      .eq("brand_id", brandId)
      .eq("chapter_key", chapterKey);
    if (error) throw new Error(`reorder phase 2 failed: ${error.message}`);
  }

  bumpCaches();
}

// ======================================================================
// Introspection (used by UI to show warnings)
// ======================================================================

export async function getCandidatesOnChapterAction(
  chapterKey: string,
  brandId: string,
): Promise<CandidateOnJourney[]> {
  await requireAdmin();
  return getCandidatesOnChapter(chapterKey, brandId);
}

export async function getCandidatesOnStepAction(
  stepId: string,
): Promise<CandidateOnJourney[]> {
  await requireAdmin();
  return getCandidatesOnStep(stepId);
}
