"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { renderMiniMarkdown } from "@/lib/mini-markdown";

export interface ChapterCompletePopupConfig {
  chapterKey: string;
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
}

interface Props {
  config: ChapterCompletePopupConfig;
  /** Called once when the user clicks the dismiss CTA. The action both
   *  records the dismissal and advances the candidate's current_chapter,
   *  which triggers the next chapter's video/intro on revalidation. */
  onDismiss: (chapterKey: string) => Promise<{ success: boolean }>;
  /** Called after a successful dismiss so the parent can stop rendering. */
  onDismissed?: () => void;
}

/**
 * Celebrates finishing a chapter. Force-dismiss with the CTA — same gravitas
 * as the chapter video popup — because dismissing IS what advances the
 * candidate to the next chapter. ESC and backdrop click are intentionally
 * inert so a stray keypress doesn't skip the celebration AND silently
 * advance the journey.
 *
 * Confetti is CSS-animated divs (no library) that auto-clean after 2s.
 * `prefers-reduced-motion` swaps in a static fade-in.
 */
export function ChapterCompletePopup({
  config,
  onDismiss,
  onDismissed,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Lock page scroll while the popup is open. Restored on unmount even if
  // dismiss fails halfway.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleDismiss = () => {
    if (pending || closing) return;
    setClosing(true);
    startTransition(async () => {
      const result = await onDismiss(config.chapterKey);
      if (result.success) {
        // Let the fade-out finish (200ms) before notifying the parent so
        // the next chapter's onboarding doesn't appear in the same frame.
        window.setTimeout(() => {
          onDismissed?.();
        }, 200);
      } else {
        setClosing(false);
      }
    });
  };

  const bodyHtml = config.bodyMd
    ? renderMiniMarkdown(config.bodyMd)
    : "";

  // Generate 32 confetti pieces with stable randomness per mount. Memo so
  // the random offsets don't reshuffle on re-render (e.g., during the
  // closing transition). Each piece gets a hue, horizontal offset, fall
  // duration, and rotation.
  const confetti = useMemo(() => {
    const pieces: Array<{
      left: string;
      delay: string;
      duration: string;
      rotate: string;
      color: string;
      shape: "square" | "circle";
    }> = [];
    const palette = [
      "var(--brand-primary, #2563eb)",
      "var(--brand-secondary, #f59e0b)",
      "var(--brand-accent, #10b981)",
      "#ec4899",
      "#facc15",
    ];
    for (let i = 0; i < 32; i++) {
      pieces.push({
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 250}ms`,
        duration: `${1400 + Math.random() * 800}ms`,
        rotate: `${Math.random() * 720 - 360}deg`,
        color: palette[i % palette.length],
        shape: i % 3 === 0 ? "circle" : "square",
      });
    }
    return pieces;
  }, []);

  return (
    <div
      className={`pp-popup-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-complete-heading"
    >
      <div
        className="cc-confetti"
        aria-hidden="true"
        // Fades out after the celebration; pointer-events stay off so it
        // doesn't intercept the CTA click.
      >
        {confetti.map((p, i) => (
          <span
            key={i}
            className={`cc-confetti-piece cc-confetti-${p.shape}`}
            style={{
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
              background: p.color,
              transform: `rotate(${p.rotate})`,
            }}
          />
        ))}
      </div>

      <div className="pp-popup pp-popup-complete">
        <div className="cc-popup-icon" aria-hidden="true">
          🎉
        </div>
        <h2
          id="chapter-complete-heading"
          className="pp-popup-title cc-popup-title"
        >
          {config.heading}
        </h2>

        {bodyHtml && (
          <div
            className="pp-popup-prose cc-popup-prose"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        )}

        <div className="pp-popup-foot">
          <button
            type="button"
            className="pp-popup-cta"
            onClick={handleDismiss}
            disabled={pending || closing}
          >
            {pending ? "…" : config.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
