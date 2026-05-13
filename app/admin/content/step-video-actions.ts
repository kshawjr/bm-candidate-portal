"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";

const STORAGE_BUCKET = "brand-assets";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
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

export interface StepTransitionVideoFormData {
  videoUrl: string;
  posterUrl: string | null;
  hasSound: boolean | null;
  isActive: boolean;
}

/**
 * Upsert a step's transition video. Looks up brand_id off the step row
 * so the caller doesn't have to thread it through. The (brand_id,
 * step_id) unique constraint means re-saving updates in place.
 */
export async function saveStepTransitionVideoAction(
  stepId: string,
  data: StepTransitionVideoFormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const videoUrl = data.videoUrl?.trim();
  if (!videoUrl) {
    return { success: false, error: "Video URL is required" };
  }
  // has_sound must be a deliberate Yes/No on MP4 videos — mirrors the
  // slide-video has_sound enforcement so admins can't silently ship a
  // video with no autoplay-mute decision.
  if (data.hasSound !== true && data.hasSound !== false) {
    return {
      success: false,
      error: "Pick whether this video has sound (Yes or No)",
    };
  }

  const app = createAppServiceClient();
  const { data: step, error: stepErr } = await app
    .from("steps_config")
    .select("id, brand_id")
    .eq("id", stepId)
    .maybeSingle();
  if (stepErr) return { success: false, error: stepErr.message };
  if (!step) return { success: false, error: "Step not found" };

  const { error } = await app.from("step_transition_videos").upsert(
    {
      brand_id: step.brand_id,
      step_id: stepId,
      video_url: videoUrl,
      poster_url: data.posterUrl?.trim() || null,
      has_sound: data.hasSound,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id,step_id" },
  );
  if (error) {
    return {
      success: false,
      error: `step_transition_videos upsert failed: ${error.message}`,
    };
  }

  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

export async function deleteStepTransitionVideoAction(
  stepId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const app = createAppServiceClient();
  const { error } = await app
    .from("step_transition_videos")
    .delete()
    .eq("step_id", stepId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
  return { success: true };
}

interface SignedUploadInit {
  signedUrl: string;
  publicUrl: string;
  contentType: string;
}

/**
 * Mint a signed upload URL for a step transition video. Same direct-
 * to-storage pattern as the chapter-video / slide-video uploads —
 * server hands back a signed URL, browser PUTs the file straight to
 * Supabase Storage. 100 MB cap, MP4 / MOV / WebM only. Stored in
 * brand-assets/{brandSlug}/step-transition-videos/{ts}-{name}.
 */
export async function createStepTransitionVideoUploadAction(
  brandSlug: string,
  filename: string,
  contentType: string,
  fileSize: number,
): Promise<SignedUploadInit | { error: string }> {
  await requireAdmin();

  if (!brandSlug || !/^[a-z0-9-]+$/.test(brandSlug)) {
    return { error: "Invalid brand slug" };
  }
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    return { error: "Video must be MP4, MOV, or WebM" };
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { error: "Invalid file size" };
  }
  if (fileSize > MAX_VIDEO_BYTES) {
    return {
      error: "Video files must be under 100 MB. Try compressing or trimming.",
    };
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${brandSlug}/step-transition-videos/${Date.now()}-${safeName}`;

  const core = createCoreClient();
  const { data, error } = await core.storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { error: error?.message ?? "Failed to create upload URL" };
  }

  const { data: pub } = core.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) return { error: "Failed to resolve public URL" };

  return {
    signedUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
    contentType,
  };
}
