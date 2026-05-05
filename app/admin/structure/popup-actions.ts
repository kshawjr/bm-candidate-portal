"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { parseVideoSource, type VideoProvider } from "@/lib/video-source";

const STORAGE_BUCKET = "brand-assets";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

// PR 48: matching middleware-level admin auth bypass (PR 47). Returns
// a stub user so existing call sites that destructure or check the
// return value don't break, but skips the actual gate. Restore the
// getAdminUser() check + Not authorized throw when re-enabling per
// TODO_AUTH.md.
const STUB_ADMIN_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "auth-disabled@bmave.com",
};
async function requireAdmin() {
  return STUB_ADMIN_USER;
}

// ======================================================================
// Chapter videos
// ======================================================================

export interface ChapterVideoFormData {
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
  isActive: boolean;
}

/**
 * Upsert the transition video for a (brand, chapter). Validates the URL
 * parses to one of the supported providers; trusts the parsed provider over
 * the form's dropdown if they disagree.
 */
export async function saveChapterVideoAction(
  brandId: string,
  chapterKey: string,
  data: ChapterVideoFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!chapterKey) {
    return { success: false, error: "chapter_key required" };
  }
  const url = data.videoUrl.trim();
  if (!url) return { success: false, error: "Video URL is required" };
  const parsed = parseVideoSource(url);
  if (!parsed) {
    return {
      success: false,
      error:
        "Couldn't parse that video URL. Use a YouTube, Vimeo, or direct .mp4 URL.",
    };
  }

  const app = createAppServiceClient();
  const { error } = await app.from("chapter_videos").upsert(
    {
      brand_id: brandId,
      chapter_key: chapterKey,
      title: data.title?.trim() || null,
      video_url: url,
      video_provider: parsed.provider,
      description: data.description?.trim() || null,
      cta_dismiss_label: data.ctaDismissLabel.trim() || "Got it",
      is_active: data.isActive,
    },
    { onConflict: "brand_id,chapter_key" },
  );
  if (error) {
    return {
      success: false,
      error: `chapter_videos upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function deleteChapterVideoAction(
  brandId: string,
  chapterKey: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("chapter_videos")
    .delete()
    .eq("brand_id", brandId)
    .eq("chapter_key", chapterKey);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

/**
 * Upload an mp4/mov/webm file for a chapter's transition video. Stored in
 * brand-assets/{brandSlug}/chapter-videos/{ts}-{name}. Returns the public
 * URL — the form writes that into videoUrl and saves with provider=mp4.
 */
export async function uploadChapterVideoAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };
  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    return { error: "Video must be MP4, MOV, or WebM" };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { error: "Video must be under 100 MB" };
  }
  if (!brandSlug || !/^[a-z0-9-]+$/.test(brandSlug)) {
    return { error: "Invalid brand slug" };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${brandSlug}/chapter-videos/${Date.now()}-${safeName}`;

  const core = createCoreClient();
  const { error: upErr } = await core.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data: pub } = core.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) return { error: "Failed to resolve public URL" };
  return { url: pub.publicUrl };
}

// ======================================================================
// Chapter intro popups (moved here from /admin/welcome-popup as part of
// PR 34's consolidation of chapter onboarding admin into /admin/structure)
// ======================================================================

export interface ChapterIntroFormData {
  heading: string;
  bodyMd: string;
  heroImageUrl: string | null;
  bullets: Array<{ icon: string; text: string }>;
  ctaDismissLabel: string;
  isActive: boolean;
  showAsBanner: boolean;
  partnerCalloutText: string | null;
  /** PR 40: optional pre-dismiss checklist. Empty items array means
   *  no checklist — the row's pre_dismiss_checklist column is set to
   *  null in that case. */
  preDismissChecklist: {
    heading: string;
    items: string[];
  } | null;
  /** F2 follow-up: scarcity block content (only renders on first_chat).
   *  null → renderer falls back to hardcoded copy. */
  scarcityFraming: { heading: string; body: string } | null;
  /** F2 follow-up: range for the random "N more candidates" count.
   *  null → no count rendered. */
  slotsRemaining: { min: number; max: number } | null;
  /** F2 follow-up: helper text for the pre-dismiss checklist gate. */
  continueHint: string | null;
}

export async function saveChapterIntroAction(
  brandId: string,
  chapterKey: string,
  data: ChapterIntroFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!chapterKey || typeof chapterKey !== "string") {
    return { success: false, error: "chapter_key required" };
  }
  if (!data.heading.trim()) {
    return { success: false, error: "Heading is required" };
  }
  if (!data.bodyMd.trim()) {
    return { success: false, error: "Body is required" };
  }

  const cleanBullets = (data.bullets || [])
    .map((b) => ({
      icon: typeof b.icon === "string" ? b.icon.trim().slice(0, 8) : "",
      text: typeof b.text === "string" ? b.text.trim() : "",
    }))
    .filter((b) => b.text.length > 0);

  const app = createAppServiceClient();
  const { error } = await app.from("chapter_intro_popups").upsert(
    {
      brand_id: brandId,
      chapter_key: chapterKey,
      heading: data.heading.trim(),
      body_md: data.bodyMd,
      hero_image_url: data.heroImageUrl?.trim() || null,
      bullets: cleanBullets,
      cta_dismiss_label: data.ctaDismissLabel.trim() || "Let's go",
      is_active: data.isActive,
      show_as_banner: data.showAsBanner,
      partner_callout_text: data.partnerCalloutText?.trim() || null,
      pre_dismiss_checklist: (() => {
        if (!data.preDismissChecklist) return null;
        const items = data.preDismissChecklist.items
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (items.length === 0) return null;
        return {
          heading:
            data.preDismissChecklist.heading.trim() ||
            "Before you continue",
          items,
        };
      })(),
      scarcity_framing: (() => {
        if (!data.scarcityFraming) return null;
        const heading = data.scarcityFraming.heading.trim();
        const body = data.scarcityFraming.body.trim();
        if (!heading && !body) return null;
        return { heading, body };
      })(),
      slots_remaining: (() => {
        if (!data.slotsRemaining) return null;
        const min = Math.max(1, Math.floor(data.slotsRemaining.min));
        const max = Math.max(min, Math.floor(data.slotsRemaining.max));
        return { min, max };
      })(),
      continue_hint: data.continueHint?.trim() || null,
    },
    { onConflict: "brand_id,chapter_key" },
  );
  if (error) {
    return {
      success: false,
      error: `chapter_intro_popups upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function deleteChapterIntroAction(
  brandId: string,
  chapterKey: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("chapter_intro_popups")
    .delete()
    .eq("brand_id", brandId)
    .eq("chapter_key", chapterKey);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

// ======================================================================
// Chapter complete popups (PR 36)
// ======================================================================

export interface ChapterCompleteFormData {
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
  isActive: boolean;
}

export async function saveChapterCompleteAction(
  brandId: string,
  chapterKey: string,
  data: ChapterCompleteFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!chapterKey) {
    return { success: false, error: "chapter_key required" };
  }
  if (!data.heading.trim()) {
    return { success: false, error: "Heading is required" };
  }

  const app = createAppServiceClient();
  const { error } = await app.from("chapter_complete_popups").upsert(
    {
      brand_id: brandId,
      chapter_key: chapterKey,
      heading: data.heading.trim(),
      body_md: data.bodyMd?.trim() || null,
      cta_label: data.ctaLabel.trim() || "Keep going",
      is_active: data.isActive,
    },
    { onConflict: "brand_id,chapter_key" },
  );
  if (error) {
    return {
      success: false,
      error: `chapter_complete_popups upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function deleteChapterCompleteAction(
  brandId: string,
  chapterKey: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("chapter_complete_popups")
    .delete()
    .eq("brand_id", brandId)
    .eq("chapter_key", chapterKey);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/structure");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function uploadChapterIntroHeroAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Image must be JPG, PNG, or WebP" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be under 5 MB" };
  }
  if (!brandSlug || !/^[a-z0-9-]+$/.test(brandSlug)) {
    return { error: "Invalid brand slug" };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${brandSlug}/chapter-intros/${Date.now()}-${safeName}`;

  const core = createCoreClient();
  const { error: upErr } = await core.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data: pub } = core.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) return { error: "Failed to resolve public URL" };
  return { url: pub.publicUrl };
}
