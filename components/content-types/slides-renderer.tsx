"use client";

import Image from "next/image";
import { useState } from "react";

export interface Slide {
  id: string;
  image_url: string;
  alt?: string | null;
  caption?: string | null;
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
}

const HANDOFF_LOADING_MS = 700;

export function SlidesRenderer({
  slides,
  onComplete,
  disabled = false,
  nextStepLabel = null,
  nextStepIsApplication = false,
}: Props) {
  const [idx, setIdx] = useState(0);
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
          <div className="slide-canvas">
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
          </div>

          {slide!.caption && (
            <p className="slide-caption">{slide!.caption}</p>
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
