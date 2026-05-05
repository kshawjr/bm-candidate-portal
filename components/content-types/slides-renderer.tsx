"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

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
  alt?: string | null;
  caption?: string | null;
  /** PR 58: optional heading rendered above the image. Greets the
   *  candidate ("Welcome to Hounds Town") when set. Supports the
   *  `{{first_name}}` template variable, replaced at render time with
   *  the candidate's name (falls back to "there"). */
  heading?: string | null;
}

/**
 * Replace template variables in slide content. Resolved at render time
 * against the candidate already in scope.
 *
 * Supported variables:
 *   {{first_name}}            — bare name; falls back to "there"
 *   {{first_name_greeting}}   — full greeting prefix that vanishes
 *                               cleanly when the name is unknown.
 *                               "Hi Jane, " when set, "" when not.
 *
 * The greeting variant exists so admins can write headings like
 * "{{first_name_greeting}}Welcome to Hounds Town" — which renders as
 * "Hi Jane, Welcome to Hounds Town" with a name and just
 * "Welcome to Hounds Town" without one, instead of the awkward
 * "Welcome, there, to Hounds Town" the bare {{first_name}} fallback
 * would produce inside a sentence.
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

interface Props {
  slides: Slide[];
  onComplete: () => void;
  disabled?: boolean;
  /** PR 39: drives the handoff card's preview text. The cinematic shell
   *  reads the next step in the chapter and passes its label here. Null
   *  when this is the last step of the chapter. */
  nextStepLabel?: string | null;
  /** PR 39: lets the handoff card use the friendlier "Tell us about
   *  yourself" framing when the next step is the Chapter 1 application. */
  nextStepIsApplication?: boolean;
  /** PR 54: per-slide tracking. Fires once whenever the candidate lands
   *  on a real image slide (not the virtual handoff card at the end).
   *  Wired by CinematicShell to logEventByTokenAction. */
  onSlideViewed?: (slideId: string, slideIndex: number) => void;
  /** PR 58: candidate context used by `applySlideTemplate` to resolve
   *  `{{first_name}}` in heading/caption text. */
  candidate?: { first_name?: string | null };
}

const HANDOFF_LOADING_MS = 700;

export function SlidesRenderer({
  slides,
  onComplete,
  disabled = false,
  nextStepLabel = null,
  nextStepIsApplication = false,
  onSlideViewed,
  candidate,
}: Props) {
  const [idx, setIdx] = useState(0);

  // Fire slide_viewed once per index change. Skips the handoff index
  // (idx === slides.length) since that's a sentinel screen, not a real
  // slide. Includes the initial mount (slide 0) so the entry is tracked.
  useEffect(() => {
    if (!onSlideViewed) return;
    if (idx >= slides.length) return;
    const slide = slides[idx];
    if (!slide) return;
    onSlideViewed(slide.id, idx);
  }, [idx, slides, onSlideViewed]);
  // PR 39: brief "Setting things up..." overlay between the handoff click
  // and the actual onComplete fire — bridges the visual gap before the
  // application form mounts.
  const [transitioning, setTransitioning] = useState(false);

  if (slides.length === 0) {
    return (
      <div className="cine-placeholder">
        <div className="cine-placeholder-icon">🎞️</div>
        <h4>No slides yet</h4>
        <p>
          Seed or edit <code>steps_config.config.slides</code> for this step.
        </p>
      </div>
    );
  }

  // PR 39: virtual handoff card sits at index === slides.length, AFTER all
  // real image slides. Increases the dot count by one and adds a "Next:"
  // moment before stepping out of the slides experience entirely.
  const totalScreens = slides.length + 1;
  const isHandoff = idx === slides.length;
  const slide = isHandoff
    ? null
    : slides[Math.min(idx, slides.length - 1)];

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (isHandoff) {
      // Already on the handoff card — handled by the dedicated CTA below.
      return;
    }
    if (idx === slides.length - 1) {
      setIdx(slides.length);
    } else {
      setIdx((i) => i + 1);
    }
  };

  const finish = () => {
    if (transitioning || disabled) return;
    setTransitioning(true);
    window.setTimeout(() => {
      onComplete();
    }, HANDOFF_LOADING_MS);
  };

  if (transitioning) {
    return (
      <div className="slides-handoff-loading" role="status" aria-live="polite">
        <div className="slides-handoff-loading-dot" aria-hidden="true" />
        <p>Setting things up…</p>
      </div>
    );
  }

  return (
    <div className="slides-renderer">
      {isHandoff ? (
        <div className="slides-handoff-card">
          <div className="slides-handoff-eyebrow">Next up</div>
          <h2 className="slides-handoff-heading">
            {nextStepIsApplication
              ? "Now we'd like to get to know you."
              : `Next: ${nextStepLabel ?? "the next step"}`}
          </h2>
          <p className="slides-handoff-sub">
            {nextStepIsApplication
              ? "A short application — about 10 minutes. Your answers save automatically."
              : "Click below when you're ready."}
          </p>
          <button
            type="button"
            className="slides-handoff-cta"
            onClick={finish}
            disabled={disabled || transitioning}
          >
            {nextStepIsApplication
              ? "Tell us about yourself →"
              : "Continue →"}
          </button>
        </div>
      ) : (
        <>
          {slide!.heading && (
            <h2 className="slide-heading">
              {applySlideTemplate(slide!.heading, candidate ?? {})}
            </h2>
          )}
          <div className="slide-canvas">
            {slide!.media_type === "video" && slide!.video_url ? (
              <video
                key={slide!.id}
                src={slide!.video_url}
                poster={slide!.poster_url ?? undefined}
                controls
                playsInline
                preload="metadata"
                width={1280}
                height={720}
              />
            ) : (
              <Image
                key={slide!.id}
                src={slide!.image_url}
                alt={slide!.alt ?? ""}
                width={1280}
                height={720}
                priority
                sizes="(max-width: 960px) 100vw, 900px"
                // Slide images are web-ready exports (PNG from Canva, SVG from
                // placeholder services). Skip Next's image optimizer so SVGs
                // work too — the source is already sized appropriately.
                unoptimized
              />
            )}
          </div>

          {slide!.caption && (
            <p className="slide-caption">
              {applySlideTemplate(slide!.caption, candidate ?? {})}
            </p>
          )}
        </>
      )}

      <div className="slide-controls">
        <button
          type="button"
          className="slide-nav-btn"
          onClick={goPrev}
          disabled={idx === 0 || disabled}
        >
          ← Back
        </button>

        <div className="slide-dots" role="tablist">
          {Array.from({ length: totalScreens }).map((_, i) => {
            const cls = [
              "slide-dot",
              i === idx && "active",
              i < idx && "done",
              // Visually distinguish the handoff dot so the dot row hints
              // at the change of pace at the end of the deck.
              i === slides.length && "handoff",
            ]
              .filter(Boolean)
              .join(" ");
            const label =
              i === slides.length
                ? "Handoff card"
                : `Slide ${i + 1} of ${slides.length}`;
            return (
              <button
                key={i}
                type="button"
                className={cls}
                onClick={() => setIdx(i)}
                aria-label={label}
                aria-current={i === idx ? "true" : undefined}
                disabled={disabled}
              />
            );
          })}
        </div>

        {isHandoff ? (
          // The handoff card has its own primary CTA above; render a hidden
          // spacer here to keep the controls row balanced.
          <span className="slide-nav-btn-placeholder" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="slide-nav-btn primary"
            onClick={goNext}
            disabled={disabled}
          >
            {idx === slides.length - 1 ? "Almost done →" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}
