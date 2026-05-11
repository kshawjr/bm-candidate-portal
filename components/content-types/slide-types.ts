// Shared slide types + constants. Lives in a non-"use client" module
// so server code (actions.ts) can import runtime values like
// CAPTION_SIZES without tripping the Next.js client-module proxy that
// blocks calls like `.includes()` on the server. The renderer in
// slides-renderer.tsx ("use client") re-imports these and contributes
// the React component on top.

export type CaptionSize = "sm" | "md" | "lg";

export const CAPTION_SIZES: ReadonlyArray<CaptionSize> = ["sm", "md", "lg"];

export interface Slide {
  id: string;
  /** Defaults to "image" when omitted (existing slides). The video case
   *  swaps the <Image> for a <video controls> with the same canvas
   *  dimensions; image-specific fields (alt) are unused for video. */
  media_type?: "image" | "video";
  image_url: string;
  /** Required when `media_type === "video"`. Points at an MP4 served
   *  from the same brand-assets bucket as slide images. */
  video_url?: string | null;
  /** Optional poster frame shown before the video plays — without it,
   *  the browser shows a black frame, which feels off in a "light and
   *  fluffy" portal. */
  poster_url?: string | null;
  /** Required when `media_type === "video"` — admin picks Yes/No in the
   *  slide editor and the choice drives the candidate-facing UX: silent
   *  videos play muted with no overlay; videos with audio play muted but
   *  surface a "Tap for sound" pill until the candidate unmutes. Null on
   *  legacy slides authored before this field existed; the renderer
   *  treats null as silent and the admin form forces a pick on next edit. */
  has_sound?: boolean | null;
  alt?: string | null;
  /** Sanitized HTML — only the formatting the caption editor exposes
   *  survives server-side normalization. Plain text written before the
   *  rich-text editor landed renders as-is (no markup is just text). */
  caption?: string | null;
  /** Type-scale variant for the caption. Defaults to "md" when omitted. */
  caption_size?: CaptionSize | null;
  /** Optional heading rendered above the image. Supports `{{first_name}}`
   *  template variable, replaced at render time. */
  heading?: string | null;
}

/**
 * Replace template variables in slide content. Pure function, safe to
 * call on the server or the client.
 *
 * Supported variables:
 *   {{first_name}}            — bare name; falls back to "there"
 *   {{first_name_greeting}}   — full greeting prefix that vanishes
 *                               cleanly when the name is unknown.
 *                               "Hi Jane, " when set, "" when not.
 */
export function applySlideTemplate(
  content: string,
  candidate: { first_name?: string | null },
): string {
  const trimmed = candidate.first_name?.trim() ?? "";
  const name = trimmed || "there";
  const greeting = trimmed ? `Hi ${trimmed}, ` : "";
  return content
    .replace(/\{\{first_name_greeting\}\}/g, greeting)
    .replace(/\{\{first_name\}\}/g, name);
}
