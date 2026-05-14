"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// 25 seconds of "candidate has been present with the content" is enough
// commitment signal to release the Continue button. Stronger than
// "always visible" (skips without engagement), weaker than "wait for
// ended" (punishes long videos). Timer is on POPUP MOUNT time, not
// playback time — pausing the video still releases the button at 25s,
// because the signal we want is presence, not strict watch-through.
// PR 124 bumped from 10s → 25s for stronger engagement on the
// transition videos that frame each step's purpose.
const DISMISS_GATE_MS = 25_000;

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
 * PR 125 — unified video playback rule (shared with SlideVideo and
 * ChapterVideoPopup):
 *   - has_sound: true  → video starts PAUSED, native controls visible,
 *                        candidate taps play to start with sound
 *   - has_sound: false / null → video AUTOPLAYS MUTED, no controls
 *                        (ambient / decorative)
 *
 * Replaces the prior muted-autoplay-then-unmute handshake. No "Tap
 * for sound" pill, no controls-visibility timer. Mobile browsers
 * enforce autoplay-with-sound blocking regardless of our code; this
 * rule works with that policy rather than fighting it.
 *
 * Continue button: gated uniformly by a wall-clock timer
 * (DISMISS_GATE_MS) regardless of has_sound. "Candidate has been
 * present with the content" — pause / scrub doesn't extend it. The
 * `ended` state still drives the data-emphasis upgrade so the button
 * picks up primary weight once playback completes.
 */
export function StepTransitionVideoPopup({
  config,
  onDismiss,
  onDismissed,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();
  // Unified playback rule. autoplayMuted === !hasSound: when hasSound
  // is true, controls visible + autoplay off (candidate taps play
  // for sound); when false or null, autoplay muted + controls off.
  const autoplayMuted = config.hasSound !== true;
  const [ended, setEnded] = useState(false);
  const [timerElapsed, setTimerElapsed] = useState(false);
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

  // Continue button timer — uniform across has_sound modes. Used to
  // be conditional on has_sound=true with !has_sound collapsing the
  // gate to immediate; PR 125 unified it so every video (ambient or
  // sound) requires the same presence commitment before skip is
  // available.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setTimerElapsed(true);
    }, DISMISS_GATE_MS);
    return () => window.clearTimeout(t);
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

  return (
    <div
      className={`pp-popup-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Transition video"
    >
      <div className="pp-popup pp-popup-welcome">
        <div className="pp-popup-video">
          <video
            ref={videoRef}
            className="pp-popup-video-el"
            src={config.videoUrl}
            poster={config.posterUrl ?? undefined}
            playsInline
            preload="metadata"
            autoPlay={autoplayMuted}
            muted={autoplayMuted}
            controls={config.hasSound === true}
            onEnded={() => setEnded(true)}
          />
        </div>

        <div className="pp-popup-foot">
          {timerElapsed && (
            <button
              type="button"
              className="pp-popup-cta"
              onClick={handleDismiss}
              disabled={pending || closing}
              data-emphasis={ended ? "primary" : "secondary"}
            >
              {pending ? "…" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
