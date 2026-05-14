"use client";

import { useEffect, useState, useTransition } from "react";
import { parseVideoSource, type VideoProvider } from "@/lib/video-source";

// Match the step-transition-video popup's presence gate. Chapter videos
// are iframe embeds (YouTube / Vimeo), so we can't read playback state
// to decide engagement — the 25s wall-clock timer is the uniform
// signal across both popup types. PR 124 bumped 10s → 25s.
const DISMISS_GATE_MS = 25_000;

export interface ChapterVideoConfig {
  chapterKey: string;
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
}

interface Props {
  config: ChapterVideoConfig;
  /** Called once when the user clicks the dismiss CTA. Receives the chapter
   *  key so the action knows which entry to append to the dismissals array. */
  onDismiss: (chapterKey: string) => Promise<{ success: boolean }>;
  /** Called after a successful dismiss so the parent can advance the
   *  sequence (e.g. open the chapter intro popup next). */
  onDismissed?: () => void;
}

/**
 * Per-chapter transition video. Plays the first time a candidate enters a
 * chapter that has a configured video. Cannot be dismissed by clicking
 * outside or pressing Escape — the candidate has to make a deliberate click
 * on the CTA. Same gravitas as the original welcome popup, just generalized
 * so each chapter can have its own.
 */
export function ChapterVideoPopup({ config, onDismiss, onDismissed }: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tenSecondsElapsed, setTenSecondsElapsed] = useState(false);

  // Lock page scroll while the popup is open. Restored on unmount even if
  // dismiss fails halfway.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 10s presence gate — applied uniformly to every chapter video since
  // iframes don't expose audio state. Pausing / muting in the embed
  // doesn't affect the timer; it's purely "how long has the popup
  // been open."
  useEffect(() => {
    const t = window.setTimeout(() => {
      setTenSecondsElapsed(true);
    }, DISMISS_GATE_MS);
    return () => window.clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (pending || closing) return;
    setClosing(true);
    startTransition(async () => {
      const result = await onDismiss(config.chapterKey);
      if (result.success) {
        // Let the fade-out finish (200ms) before notifying the parent so the
        // chapter intro doesn't appear in the same frame the video closes.
        window.setTimeout(() => {
          onDismissed?.();
        }, 200);
      } else {
        // Dismiss failed — restore the popup so the user can try again.
        setClosing(false);
      }
    });
  };

  // Re-parse the URL on the client; the server stored it as-is, but the embed
  // URL is computed lazily so admins can paste any youtube/vimeo URL shape.
  const parsed = parseVideoSource(config.videoUrl);

  return (
    <div
      className={`pp-popup-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={config.title ? "chapter-video-title" : undefined}
    >
      <div className="pp-popup pp-popup-welcome">
        {config.title && (
          <h2 id="chapter-video-title" className="pp-popup-title">
            {config.title}
          </h2>
        )}

        <div className="pp-popup-video">
          {parsed?.provider === "mp4" ? (
            <video
              className="pp-popup-video-el"
              src={parsed.embedUrl}
              controls
              playsInline
              preload="metadata"
            />
          ) : parsed ? (
            <iframe
              className="pp-popup-video-iframe"
              src={parsed.embedUrl}
              title={config.title ?? "Chapter video"}
              frameBorder={0}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // Should never render in production — admin form prevents saving
            // an unparseable URL — but rather than crash, show a fallback so
            // the candidate can still proceed past the popup.
            <div className="pp-popup-video-fallback">
              Video unavailable.
            </div>
          )}
        </div>

        {config.description && (
          <p className="pp-popup-desc">{config.description}</p>
        )}

        <div className="pp-popup-foot">
          {tenSecondsElapsed && (
            <button
              type="button"
              className="pp-popup-cta"
              onClick={handleDismiss}
              disabled={pending || closing}
            >
              {pending ? "…" : config.ctaDismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
