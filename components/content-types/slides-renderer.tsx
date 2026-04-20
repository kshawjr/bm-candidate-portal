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
}

export function SlidesRenderer({ slides, onComplete, disabled = false }: Props) {
  const [idx, setIdx] = useState(0);

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

  const slide = slides[Math.min(idx, slides.length - 1)];
  const isLast = idx === slides.length - 1;

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setIdx((i) => Math.min(slides.length - 1, i + 1));
    }
  };

  return (
    <div className="slides-renderer">
      <div className="slide-canvas">
        <Image
          key={slide.id}
          src={slide.image_url}
          alt={slide.alt ?? ""}
          width={1280}
          height={720}
          priority
          sizes="(max-width: 960px) 100vw, 900px"
          // Slide images are web-ready exports (PNG from Canva, SVG from
          // placeholder services). Skip Next's image optimizer so SVGs work
          // too — the source is already sized appropriately.
          unoptimized
        />
      </div>

      {slide.caption && <p className="slide-caption">{slide.caption}</p>}

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
          {slides.map((s, i) => {
            const cls = [
              "slide-dot",
              i === idx && "active",
              i < idx && "done",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={s.id}
                type="button"
                className={cls}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                aria-current={i === idx ? "true" : undefined}
                disabled={disabled}
              />
            );
          })}
        </div>

        <button
          type="button"
          className="slide-nav-btn primary"
          onClick={goNext}
          disabled={disabled}
        >
          {isLast ? "Finish tour ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}
