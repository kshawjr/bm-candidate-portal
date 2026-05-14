"use client";

import { useEffect, useRef, useState, useTransition } from "react";

// 10 seconds of "candidate has been present with the content" is enough
// commitment signal to release the Continue button. Stronger than
// "always visible" (skips without engagement), weaker than "wait for
// ended" (punishes long videos). Timer is on POPUP MOUNT time, not
// playback time — pausing the video still releases the button at 10s,
// because the signal we want is presence, not strict watch-through.
const DISMISS_GATE_MS = 10_000;

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
 * Sound behavior is driven by the admin's has_sound setting:
 *   - has_sound: true  → video starts PAUSED with controls visible.
 *                        Candidate clicks play and gets full-volume
 *                        audio (no muted-autoplay handshake).
 *   - has_sound: false → video AUTOPLAYS muted (ambient / silent).
 *   - has_sound: null  → treat as false (safe default — autoplay muted
 *                        for legacy rows that predate the field).
 *
 * The "Tap for sound" pill that previous revisions used to bridge
 * muted-autoplay → user-unmute is gone. Native <video controls> covers
 * the play / pause / volume interactions in both modes.
 *
 * Continue visibility:
 *   - has_sound: true  → hidden for the first 10 seconds after the
 *                        popup opens, then visible. Time-based, not
 *                        playback-based — pausing doesn't extend it.
 *   - has_sound: false → visible immediately (silent video is ambient).
 *   - has_sound: null  → treated as false (immediate, safe default).
 *
 * The `ended` state is still tracked so the button picks up primary
 * data-emphasis once playback finishes — even if the 10s gate already
 * released it, the visual weight upgrades when the video actually
 * completes.
 */
export function StepTransitionVideoPopup({
  config,
  onDismiss,
  onDismissed,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();
  // hasSound === true is the only mode that disables autoplay /
  // unmutes. Anything else (false or null) gets the silent-autoplay
  // treatment so we never need to ask the candidate to unmute.
  const shouldAutoplay = config.hasSound !== true;
  const initialMuted = config.hasSound !== true;
  const [muted, setMuted] = useState(initialMuted);
  const [ended, setEnded] = useState(false);
  const [tenSecondsElapsed, setTenSecondsElapsed] = useState(false);
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

  // 10s presence gate — only applies when the admin asked for sound.
  // Silent videos collapse immediately so the candidate isn't forced
  // to stare at ambient context.
  useEffect(() => {
    if (config.hasSound !== true) {
      setTenSecondsElapsed(true);
      return;
    }
    const t = window.setTimeout(() => {
      setTenSecondsElapsed(true);
    }, DISMISS_GATE_MS);
    return () => window.clearTimeout(t);
  }, [config.hasSound]);

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
            controls
            playsInline
            preload="metadata"
            autoPlay={shouldAutoplay}
            muted={muted}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onEnded={() => setEnded(true)}
          />
        </div>

        <div className="pp-popup-foot">
          {/* Continue visibility tracks the presence gate:
              - has_sound=true: hidden for 10 seconds after the popup
                opens, then visible regardless of playback state.
                Pause / scrub doesn't extend the timer — the signal
                is candidate-was-present, not strictly-watched.
              - has_sound=false (or null): visible immediately because
                tenSecondsElapsed is forced true in the timer effect. */}
          {(config.hasSound !== true || tenSecondsElapsed) && (
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
