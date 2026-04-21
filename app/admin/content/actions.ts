"use server";

import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import { getAdminUser } from "@/lib/supabase-auth";
import type { ContentCard } from "@/components/content-cards/types";
import type { Slide } from "@/components/content-types/slides-renderer";

const STORAGE_BUCKET = "brand-assets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) {
    throw new Error("Not authorized");
  }
  return user;
}

async function loadStepCards(stepId: string): Promise<ContentCard[]> {
  const app = createAppServiceClient();
  const { data, error } = await app
    .from("steps_config")
    .select("content_cards")
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(`step lookup failed: ${error.message}`);
  if (!data) throw new Error(`step not found: ${stepId}`);
  return Array.isArray(data.content_cards)
    ? (data.content_cards as ContentCard[])
    : [];
}

async function saveStepCards(stepId: string, cards: ContentCard[]) {
  const app = createAppServiceClient();
  const { error } = await app
    .from("steps_config")
    .update({ content_cards: cards })
    .eq("id", stepId);
  if (error) throw new Error(`steps_config update failed: ${error.message}`);
}

/**
 * Upsert a single content card on a step.
 * - cardIndex omitted → append a new card at the end
 * - cardIndex provided → replace the card at that index
 */
export async function saveContentCardAction(
  stepId: string,
  card: ContentCard,
  cardIndex?: number,
): Promise<void> {
  await requireAdmin();
  const cards = await loadStepCards(stepId);
  const next = [...cards];
  if (typeof cardIndex === "number" && cardIndex >= 0 && cardIndex < next.length) {
    next[cardIndex] = card;
  } else {
    next.push(card);
  }
  await saveStepCards(stepId, next);
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

/** Remove a single card by its index in the step's cards array. */
export async function deleteContentCardAction(
  stepId: string,
  cardIndex: number,
): Promise<void> {
  await requireAdmin();
  const cards = await loadStepCards(stepId);
  if (cardIndex < 0 || cardIndex >= cards.length) return;
  const next = cards.filter((_, i) => i !== cardIndex);
  await saveStepCards(stepId, next);
  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

/**
 * Upload an image file to brand-assets/{brandSlug}/{subdir}/{ts}-{name}
 * and return the public URL. Validates size + MIME type server-side.
 *
 * brand-assets lives in the SHARED bmave-core Supabase project (same bucket
 * the brand logos are stored in — see PR 4b). Using the core client means
 * uploads land where logos already work, and getPublicUrl() returns the
 * bmave-core hostname that next/image's remotePatterns already allow.
 */
async function uploadBrandAsset(
  brandSlug: string,
  subdir: "content-cards" | "slides",
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
  const path = `${brandSlug}/${subdir}/${Date.now()}-${safeName}`;

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

export async function uploadCardImageAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  return uploadBrandAsset(brandSlug, "content-cards", formData);
}

export async function uploadSlideImageAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  return uploadBrandAsset(brandSlug, "slides", formData);
}

/**
 * Upload an uploaded video file (source: 'upload' in the video config) to
 * brand-assets/{brandSlug}/videos/{ts}-{name}. Separate limits from images
 * because videos are much larger.
 */
export async function uploadStepVideoAction(
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
  const path = `${brandSlug}/videos/${Date.now()}-${safeName}`;

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
 * Generic config setter — merges the provided config object into
 * steps_config.config for the given step. Used by the video editor and
 * schedule editor; slide + cards have their own typed actions because
 * they validate specific array shapes.
 */
export async function saveStepConfigAction(
  stepId: string,
  config: Record<string, unknown>,
): Promise<void> {
  await requireAdmin();

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config must be an object");
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("steps_config")
    .select("config")
    .eq("id", stepId)
    .maybeSingle();
  if (readErr) throw new Error(`step lookup failed: ${readErr.message}`);
  if (!row) throw new Error(`step not found: ${stepId}`);

  const prev =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  const next = { ...prev, ...config };

  const { error: writeErr } = await app
    .from("steps_config")
    .update({ config: next })
    .eq("id", stepId);
  if (writeErr)
    throw new Error(`steps_config update failed: ${writeErr.message}`);

  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

// ---- slides ----

function normalizeSlides(input: unknown): Slide[] {
  if (!Array.isArray(input)) {
    throw new Error("slides must be an array");
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`slide ${i + 1}: must be an object`);
    }
    const s = raw as Record<string, unknown>;
    const image_url = typeof s.image_url === "string" ? s.image_url.trim() : "";
    if (!image_url) throw new Error(`slide ${i + 1}: image_url is required`);
    const id =
      typeof s.id === "string" && s.id.trim().length > 0
        ? s.id.trim()
        : `slide-${Date.now()}-${i}`;
    const alt =
      typeof s.alt === "string" && s.alt.trim().length > 0 ? s.alt : null;
    const caption =
      typeof s.caption === "string" && s.caption.trim().length > 0
        ? s.caption
        : null;
    return { id, image_url, alt, caption };
  });
}

/**
 * Replace the `slides` array on a step's `config` JSON, preserving any other
 * keys (e.g. `body`). Requires at least one slide — the renderer needs one
 * to function, and the admin UI blocks deleting the last slide.
 */
export async function saveSlidesAction(
  stepId: string,
  slides: Slide[],
): Promise<void> {
  await requireAdmin();

  const normalized = normalizeSlides(slides);
  if (normalized.length === 0) {
    throw new Error("At least one slide is required");
  }

  const app = createAppServiceClient();
  const { data: row, error: readErr } = await app
    .from("steps_config")
    .select("config, content_type")
    .eq("id", stepId)
    .maybeSingle();
  if (readErr) throw new Error(`step lookup failed: ${readErr.message}`);
  if (!row) throw new Error(`step not found: ${stepId}`);
  if (row.content_type !== "slides") {
    throw new Error(`step ${stepId} is not a slides step`);
  }

  const prevConfig =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as Record<string, unknown>)
      : {};
  const nextConfig = { ...prevConfig, slides: normalized };

  const { error: writeErr } = await app
    .from("steps_config")
    .update({ config: nextConfig })
    .eq("id", stepId);
  if (writeErr) throw new Error(`steps_config update failed: ${writeErr.message}`);

  revalidatePath("/admin/content");
  revalidatePath("/portal/[token]", "page");
}

