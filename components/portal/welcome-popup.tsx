"use client";

import { useEffect, useState, useTransition } from "react";
import { parseVideoSource, type VideoProvider } from "@/lib/video-source";

export interface WelcomePopupConfig {
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
}

interface Props {
  config: WelcomePopupConfig;
  /** Called once when the user clicks the dismiss CTA. */
  onDismiss: () => Promise<{ success: boolean }>;
  /** Called after a successful dismiss so the parent can advance the
   *  sequence (e.g. open the chapter intro popup next). */
  onDismissed?: () => void;
}

/**
 * One-time welcome popup. Cannot be dismissed by clicking outside or pressing
 * Escape — the candidate has to make a deliberate click on the CTA. This is
 * the candidate's first impression of the brand and the only moment the
 * welcome video is in their face, so we don't want a stray keypress to skip it.
 */
export function WelcomePopup({ config, onDismiss, onDismissed }: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Lock the page scroll while the popup is open. Restored on unmount even if
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
      const result = await onDismiss();
      if (result.success) {
        // Let the fade-out finish (200ms) before notifying the parent so the
        // chapter intro doesn't appear in the same frame the welcome closes.
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
      aria-labelledby={config.title ? "welcome-popup-title" : undefined}
    >
      <div className="pp-popup pp-popup-welcome">
        {config.title && (
          <h2 id="welcome-popup-title" className="pp-popup-title">
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
              autoPlay
              muted
            />
          ) : parsed ? (
            <iframe
              className="pp-popup-video-iframe"
              src={parsed.embedUrl}
              title={config.title ?? "Welcome video"}
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
          <button
            type="button"
            className="pp-popup-cta"
            onClick={handleDismiss}
            disabled={pending || closing}
          >
            {pending ? "…" : config.ctaDismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
