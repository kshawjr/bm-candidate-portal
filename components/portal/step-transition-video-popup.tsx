"use client";

import { useEffect, useRef, useState, useTransition } from "react";

export interface StepTransitionVideoConfig {
  stepId: string;
  videoUrl: string;
  posterUrl: string | null;
  /** Admin-picked sound flag (per Slide-video pattern). True → show the
   *  "Tap for sound" pill while muted. False → silent, no overlay.
   *  null → legacy / unset; treat as silent so the muted autoplay reads
   *  predictably. */
  hasSound: boolean | null;
}

interface Props {
  config: StepTransitionVideoConfig;
  /** Called once when the candidate dismisses the video (Continue or
   *  Skip). Appends to dismissed_step_transition_videos so the next
   *  visit to the step doesn't replay. */
  onDismiss: (stepId: string) => Promise<{ success: boolean }>;
  /** Called after a successful dismiss so the parent can advance the
   *  sequence (e.g. open the matching step transition popup next). */
  onDismissed?: () => void;
}

/**
 * Step-level transition video. Plays the first time a candidate
 * advances past the step it's attached to.
 *
 * Modeled on ChapterVideoPopup but with three step-level deviations:
 *   1. Autoplay muted (browser policy) — never auto-unmutes; if the
 *      admin marked the video has_sound, a "Tap for sound" pill
 *      surfaces over the player.
 *   2. The Continue button is enabled the whole time, but becomes the
 *      visual primary action only after the video ends.
 *   3. MP4-only — the admin form uploads a file rather than pasting a
 *      provider URL, so we render <video> directly with no provider
 *      branching.
 */
export function StepTransitionVideoPopup({
  config,
  onDismiss,
  onDismissed,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lock page scroll while the popup is open. Restored on unmount even
  // if dismiss fails halfway.
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
      const result = await onDismiss(config.stepId);
      if (result.success) {
        // Match ChapterVideoPopup's 200ms fade-out before notifying
        // the parent so a follow-on popup doesn't appear in the same
        // frame the video closes.
        window.setTimeout(() => {
          onDismissed?.();
        }, 200);
      } else {
        setClosing(false);
      }
    });
  };

  const unmute = () => {
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      // Some browsers require an explicit play() after unmute if the
      // gesture didn't already start playback.
      el.play().catch(() => {});
    }
    setMuted(false);
  };

  const showSoundPill = config.hasSound === true && muted && !ended;

  return (
    <div
      className={`pp-popup-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Transition video"
    >
      <div className="pp-popup pp-popup-welcome">
        <div className="pp-popup-video" style={{ position: "relative" }}>
          <video
            ref={videoRef}
            className="pp-popup-video-el"
            src={config.videoUrl}
            poster={config.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            autoPlay
            muted={muted}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onEnded={() => setEnded(true)}
          />
          {showSoundPill && (
            <button
              type="button"
              className="tap-for-sound is-visible"
              onClick={unmute}
              aria-label="Tap for sound"
              style={{
                position: "absolute",
                bottom: 56,
                right: 16,
              }}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 5 6 9H2v6h4l5 4V5z" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
              <span>Tap for sound</span>
            </button>
          )}
        </div>

        <div className="pp-popup-foot">
          <button
            type="button"
            className="pp-popup-cta"
            onClick={handleDismiss}
            disabled={pending || closing}
            data-emphasis={ended ? "primary" : "secondary"}
          >
            {pending ? "…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
