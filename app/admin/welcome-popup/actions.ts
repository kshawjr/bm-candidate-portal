"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { getAdminUser } from "@/lib/supabase-auth";
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

async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("Not authorized");
  return user;
}

export interface WelcomePopupFormData {
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
  isActive: boolean;
}

/**
 * Upsert the welcome popup for a brand. There is at most one row per brand
 * (unique constraint on brand_id), so this performs an upsert with on-conflict
 * on brand_id. Validates the URL parses to the declared provider.
 */
export async function saveWelcomePopupAction(
  brandId: string,
  data: WelcomePopupFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

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
  // Defensive: if the admin manually overrode the provider dropdown to
  // disagree with the URL, trust the parsed result.
  const provider = parsed.provider;

  const app = createAppServiceClient();
  const { error } = await app.from("welcome_popups").upsert(
    {
      brand_id: brandId,
      title: data.title?.trim() || null,
      video_url: url,
      video_provider: provider,
      description: data.description?.trim() || null,
      cta_dismiss_label:
        data.ctaDismissLabel.trim() || "Got it",
      is_active: data.isActive,
    },
    { onConflict: "brand_id" },
  );
  if (error) {
    return {
      success: false,
      error: `welcome_popups upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/welcome-popup");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

/**
 * Delete the welcome popup for a brand. Used by the admin "remove" button so
 * the candidate stops seeing this popup entirely. Soft-disable via is_active
 * is preferred for "pause" — this is for full removal.
 */
export async function deleteWelcomePopupAction(
  brandId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("welcome_popups")
    .delete()
    .eq("brand_id", brandId);
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/welcome-popup");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

/**
 * Upload an mp4 video for a brand's welcome popup. Stores in
 * brand-assets/{brandSlug}/welcome-videos/{ts}-{name}. Returns the public URL
 * which the form should write into the videoUrl field as provider=mp4.
 */
export async function uploadWelcomeVideoAction(
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
  const path = `${brandSlug}/welcome-videos/${Date.now()}-${safeName}`;

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

/**
 * Upload a hero image for a chapter intro popup. Mirrors the brand-asset
 * uploaders in app/admin/content/actions.ts but lives here so the structure
 * editor's chapter-intro UI can call it directly. Stored under
 * brand-assets/{brandSlug}/chapter-intros/.
 */
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

// =====================================================================
// Chapter intro popups
// =====================================================================

export interface ChapterIntroFormData {
  heading: string;
  bodyMd: string;
  heroImageUrl: string | null;
  bullets: Array<{ icon: string; text: string }>;
  ctaDismissLabel: string;
  isActive: boolean;
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
