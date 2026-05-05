"use server";

import DOMPurify from "isomorphic-dompurify";
import { revalidatePath } from "next/cache";
import { createAppServiceClient } from "@/lib/supabase-app";
import { createCoreClient } from "@/lib/core-client";
import type { ContentCard } from "@/components/content-cards/types";
import {
  CAPTION_SIZES,
  type CaptionSize,
  type Slide,
} from "@/components/content-types/slides-renderer";

const STORAGE_BUCKET = "brand-assets";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
// F3: tighter cap on slide videos than the 100 MB step-video cap. Slides
// are mid-stop transitions, not the main attraction — anything larger
// than 50 MB likely needs to live as a `video` step instead.
const MAX_SLIDE_VIDEO_BYTES = 50 * 1024 * 1024;
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
// Slides take MP4 only — keeps the served files predictable and the
// player consistent across browsers.
const ALLOWED_SLIDE_VIDEO_TYPES = new Set(["video/mp4"]);

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
 * Move a card from `fromIndex` to `toIndex`. No-op if either index is out
 * of bounds. The journey_ahead card participates in this reorder system
 * so admins can position the roadmap relative to other cards on the step.
 */
export async function reorderContentCardsAction(
  stepId: string,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  await requireAdmin();
  const cards = await loadStepCards(stepId);
  if (
    fromIndex < 0 ||
    fromIndex >= cards.length ||
    toIndex < 0 ||
    toIndex >= cards.length ||
    fromIndex === toIndex
  ) {
    return;
  }
  const next = [...cards];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
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
 * Upload an MP4 slide video to brand-assets/{brandSlug}/slides/{ts}-{name}.
 * Stays in the same `slides/` subdir as slide images so per-brand cleanup
 * is one prefix scan, not two.
 */
export async function uploadSlideVideoAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided" };
  if (!ALLOWED_SLIDE_VIDEO_TYPES.has(file.type)) {
    return { error: "Slide videos must be MP4" };
  }
  if (file.size > MAX_SLIDE_VIDEO_BYTES) {
    return { error: "Slide videos must be under 50 MB" };
  }
  if (!brandSlug || !/^[a-z0-9-]+$/.test(brandSlug)) {
    return { error: "Invalid brand slug" };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
  const path = `${brandSlug}/slides/${Date.now()}-${safeName}`;

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

/**
 * Sanitize the rich-text caption HTML emitted by the TipTap editor. Only
 * the formatting the editor exposes survives the round trip — bold,
 * italic, links — every other tag and attribute (script, style, on*,
 * inline color, etc.) is stripped. Plain text written before the
 * rich-text editor existed flows through untouched because there's no
 * markup to remove.
 */
function sanitizeCaptionHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["strong", "em", "a", "br"],
    ALLOWED_ATTR: ["href"],
    // Block javascript: / data: / vbscript: hrefs even if the tag-level
    // allowlist would let them through.
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    KEEP_CONTENT: true,
    USE_PROFILES: { html: true },
  });
}

function normalizeSlides(input: unknown): Slide[] {
  if (!Array.isArray(input)) {
    throw new Error("slides must be an array");
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`slide ${i + 1}: must be an object`);
    }
    const s = raw as Record<string, unknown>;
    // Default to "image" when omitted so existing slides written before
    // F3 don't start failing validation. Anything else gets coerced back
    // to "image" — the renderer only branches on "video".
    const media_type = s.media_type === "video" ? "video" : "image";
    const image_url = typeof s.image_url === "string" ? s.image_url.trim() : "";
    const video_url =
      typeof s.video_url === "string" && s.video_url.trim().length > 0
        ? s.video_url.trim()
        : null;
    const poster_url =
      typeof s.poster_url === "string" && s.poster_url.trim().length > 0
        ? s.poster_url.trim()
        : null;
    if (media_type === "video") {
      if (!video_url) {
        throw new Error(`slide ${i + 1}: video_url is required for video slides`);
      }
    } else if (!image_url) {
      throw new Error(`slide ${i + 1}: image_url is required`);
    }
    const id =
      typeof s.id === "string" && s.id.trim().length > 0
        ? s.id.trim()
        : `slide-${Date.now()}-${i}`;
    const alt =
      typeof s.alt === "string" && s.alt.trim().length > 0 ? s.alt : null;
    const captionRaw =
      typeof s.caption === "string" && s.caption.trim().length > 0
        ? s.caption
        : null;
    // Sanitize, then drop entirely if the visible text is empty after
    // tag stripping — handles the admin-types-and-clears flow as well as
    // someone pasting only disallowed markup.
    const captionSanitized = captionRaw
      ? sanitizeCaptionHtml(captionRaw).trim()
      : "";
    const captionVisible =
      captionSanitized.replace(/<[^>]+>/g, "").trim().length > 0;
    const captionFinal = captionVisible ? captionSanitized : null;
    const captionSizeRaw =
      typeof s.caption_size === "string"
        ? (s.caption_size.toLowerCase() as CaptionSize)
        : null;
    const caption_size: CaptionSize | null =
      captionSizeRaw && CAPTION_SIZES.includes(captionSizeRaw)
        ? captionSizeRaw
        : null;
    // PR 58: preserve heading so the welcome migration's value isn't
    // wiped the next time an admin saves the slide deck. Same shape as
    // caption: trimmed string or null.
    const heading =
      typeof s.heading === "string" && s.heading.trim().length > 0
        ? s.heading
        : null;
    return {
      id,
      media_type,
      image_url,
      video_url,
      poster_url,
      alt,
      caption: captionFinal,
      caption_size,
      heading,
    };
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

