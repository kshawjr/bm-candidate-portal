"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { TourCompletionSplash } from "@/components/portal/tour-completion-splash";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import {
  CAPTION_SIZES,
  applySlideTemplate,
  type CaptionSize,
  type Slide,
} from "./slide-types";
import {
  StepTransitionVideoPopup,
  type StepTransitionVideoConfig,
} from "@/components/portal/step-transition-video-popup";

// Re-export so existing client-side imports of these symbols from
// `slides-renderer` keep resolving. Server-side code (e.g.
// app/admin/content/actions.ts) must import from `./slide-types`
// directly — a re-export through this `"use client"` file would still
// be proxied at the server boundary and tripping calls like
// CAPTION_SIZES.includes().
export { CAPTION_SIZES, applySlideTemplate };
export type { CaptionSize, Slide };

interface Props {
  slides: Slide[];
  onComplete: () => void;
  disabled?: boolean;
  /** PR 54: per-slide tracking. Fires once whenever the candidate lands
   *  on a slide. Wired by CinematicShell to logEventByTokenAction. */
  onSlideViewed?: (slideId: string, slideIndex: number) => void;
  /** PR 58: candidate context used by `applySlideTemplate` to resolve
   *  `{{first_name}}` in heading/caption text. */
  candidate?: { first_name?: string | null };
  /** Transition video to play between the handoff click and onComplete.
   *  Null = no video configured, or already dismissed (filtered upstream
   *  in app/portal/[token]/page.tsx). The renderer just trusts the
   *  passed config and fires if non-null. Inline trigger replaces the
   *  cinematic-shell's effect-based trigger from PRs 102–104, which was
   *  brittle across router.refresh boundaries. */
  stepTransitionVideo?: StepTransitionVideoConfig | null;
  /** Dismissal binding for the inline video. Server-bound in page.tsx;
   *  forwarded into StepTransitionVideoPopup. */
  onDismissStepTransitionVideo?: (
    stepId: string,
  ) => Promise<{ success: boolean }>;
  /** Brand primary colour for the completion splash's Continue button. */
  brandPrimaryColor?: string | null;
}

const HANDOFF_LOADING_MS = 700;
/** Pause between landing on a last image slide and the completion
 *  splash appearing. */
const SPLASH_DELAY_MS = 500;

export function SlidesRenderer({
  slides,
  onComplete,
  disabled = false,
  onSlideViewed,
  candidate,
  stepTransitionVideo = null,
  onDismissStepTransitionVideo,
  brandPrimaryColor = null,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [pendingVideo, setPendingVideo] =
    useState<StepTransitionVideoConfig | null>(null);
  const reduceMotion = useReducedMotion();
  // Skip the initial-mount scroll: candidates lifting into the slides
  // step may have intentional scroll position (e.g., reading the
  // journey card below); jumping them on mount would feel jarring.
  // Subsequent slide changes are the ones we want to recenter.
  const didInitialMountRef = useRef(false);
  const slideCanvasRef = useRef<HTMLDivElement | null>(null);

  // Center the slide image (.slide-canvas) in the viewport on every
  // slide change. Caption length no longer affects slide visibility
  // — the image always lands in the same comfortable position with
  // chapter nav above and Next button below. Smooth behavior so the
  // transition feels intentional. PR 108 used window.scrollTo({ top:
  // 0 }) but that pinned to absolute top, which felt jolting and
  // pushed the image off-screen when captions were long.
  useEffect(() => {
    if (!didInitialMountRef.current) {
      didInitialMountRef.current = true;
      return;
    }
    slideCanvasRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [idx]);

  // Fire slide_viewed once per index change. Includes the initial mount
  // (slide 0) so the entry is tracked.
  useEffect(() => {
    if (!onSlideViewed) return;
    const slide = slides[idx];
    if (!slide) return;
    onSlideViewed(slide.id, idx);
  }, [idx, slides, onSlideViewed]);
  // PR 39: brief "Setting things up..." overlay between the last-slide
  // click and the actual onComplete fire — bridges the visual gap before
  // the next step mounts.
  const [transitioning, setTransitioning] = useState(false);
  // Completion splash ("Nice work!"). Once shown it stays up until the
  // candidate hits its Continue button; it only resets when this
  // component remounts (leaving the step and coming back).
  const [showSplash, setShowSplash] = useState(false);
  // Id of the video slide whose video failed to load (404, network,
  // decode error, or no data at all). Keyed to the slide id so a
  // failure on one slide never affects another.
  const [failedVideoSlideId, setFailedVideoSlideId] = useState<
    string | null
  >(null);

  const lastIdx = slides.length - 1;
  const clampedIdx = Math.min(idx, Math.max(lastIdx, 0));
  const onLastSlide = slides.length > 0 && clampedIdx === lastIdx;
  const activeSlide = slides[clampedIdx];
  const activeIsVideo =
    activeSlide?.media_type === "video" && Boolean(activeSlide?.video_url);
  const isSingleImageDeck = slides.length === 1 && !activeIsVideo;

  // Splash trigger for a last IMAGE slide in a multi-slide deck: show
  // it SPLASH_DELAY_MS after the candidate lands there. Video last
  // slides wait for the video's `ended` event instead (see onEnded
  // below). A single-image deck never auto-splashes — without this
  // guard idx 0 === last index at mount and the splash would pop up
  // before the candidate saw anything. The cleanup cancels the timer
  // if they hit Back (or a dot) inside the delay window.
  useEffect(() => {
    if (showSplash || !onLastSlide || activeIsVideo || isSingleImageDeck) {
      return;
    }
    const t = window.setTimeout(() => setShowSplash(true), SPLASH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [clampedIdx, onLastSlide, activeIsVideo, isSingleImageDeck, showSplash]);

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

  const slide = slides[clampedIdx];

  const isSingleSlide = slides.length === 1;
  const isLastSlide = onLastSlide;

  const goPrev = () => setIdx((i) => Math.max(0, i - 1));
  // Next only advances slides. Leaving the tour happens exclusively via
  // the completion splash's Continue button (finish()).
  const goNext = () => {
    setIdx((i) => Math.min(slides.length - 1, i + 1));
  };

  // A video only ends the tour when it is the LAST slide (this covers
  // the single-video deck too). A video in the middle of a deck ending
  // does nothing — the candidate keeps paging with Next.
  const handleVideoEnded = (slideIdx: number) => {
    if (slideIdx === lastIdx) setShowSplash(true);
  };

  // A broken last-slide video never fires `ended`, which would leave
  // the candidate with no splash and no way forward. In that case we
  // show the same plain Continue as a single-image deck. Mid-deck
  // video failures need nothing extra — Next is never gated.
  const lastVideoFailed =
    isLastSlide && activeIsVideo && failedVideoSlideId === slide.id;
  const showFallbackContinue = isSingleImageDeck || lastVideoFailed;

  // finish() does one of two things on Continue click:
  //   1. If a step transition video is configured for this step and
  //      hasn't been dismissed yet, surface it inline before advancing.
  //      The "Setting things up…" loader stays out of the way until
  //      after the video closes — the video itself is the loading
  //      gesture in that case.
  //   2. Otherwise fall through to the existing 700ms loader → advance.
  const finish = () => {
    // pendingVideo guard: a second click while the transition video is
    // open must not skip straight to the loader.
    if (transitioning || disabled || pendingVideo) return;
    if (stepTransitionVideo) {
      setPendingVideo(stepTransitionVideo);
      return;
    }
    setTransitioning(true);
    window.setTimeout(() => {
      onComplete();
    }, HANDOFF_LOADING_MS);
  };

  const handleTransitionVideoDismiss = async (stepId: string) => {
    if (!onDismissStepTransitionVideo) return { success: false };
    return onDismissStepTransitionVideo(stepId);
  };

  const handleTransitionVideoDismissed = () => {
    setPendingVideo(null);
    // Fire the loader → advance chain immediately. The video already
    // bridged the visual gap, so we don't need the 700ms wait here —
    // the candidate just clicked Continue and expects motion.
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

  // The splash REPLACES the tour view rather than stacking on top of
  // it. The step transition video popup (z-index 1000) still renders
  // above the splash (z-index 200) after Continue is pressed.
  if (showSplash) {
    return (
      <>
        <TourCompletionSplash
          brandPrimaryColor={brandPrimaryColor}
          onContinue={finish}
          disabled={disabled || Boolean(pendingVideo)}
        />
        {pendingVideo && (
          <StepTransitionVideoPopup
            key={pendingVideo.stepId}
            config={pendingVideo}
            onDismiss={handleTransitionVideoDismiss}
            onDismissed={handleTransitionVideoDismissed}
          />
        )}
      </>
    );
  }

  return (
    <div className="slides-renderer">
      {slide.heading && (
        <h2 className="slide-heading">
          {applySlideTemplate(slide.heading, candidate ?? {})}
        </h2>
      )}
      <div className="slide-canvas" ref={slideCanvasRef}>
        {slide.media_type === "video" && slide.video_url ? (
          <SlideVideo
            key={slide.id}
            src={slide.video_url}
            poster={slide.poster_url ?? null}
            hasSound={slide.has_sound === true}
            reduceMotion={reduceMotion}
            onEnded={() => handleVideoEnded(clampedIdx)}
            onLoadFailed={() => setFailedVideoSlideId(slide.id)}
            onLoadRecovered={() =>
              setFailedVideoSlideId((id) => (id === slide.id ? null : id))
            }
          />
        ) : (
          <Image
            key={slide.id}
            src={slide.image_url}
            alt={slide.alt ?? ""}
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

      {slide.caption && (
        // <div> wrapper (not <p>) so the sanitized HTML can contain
        // its own <p> elements — TipTap emits one paragraph per
        // block, and per-paragraph text-align lives on those inner
        // <p>s. A <p> inside a <p> would auto-close the outer and
        // strip the size class.
        <div
          className={`slide-caption slide-caption--${slide.caption_size ?? "md"}`}
          // Caption is sanitized server-side at save time
          // (sanitizeCaptionHtml in app/admin/content/actions.ts) —
          // only <strong>, <em>, <a href>, and <p style="text-align">
          // survive. Existing plain-text captions render as-is.
          dangerouslySetInnerHTML={{
            __html: applySlideTemplate(slide.caption, candidate ?? {}),
          }}
        />
      )}

      {/* PR 128: slide-1-only attention cue. First-time candidates pause
          on slide 1 looking for what to do; a bouncing arrow pointing
          toward Next removes the "where do I tap?" moment. aria-hidden
          because the Next button is already the semantic CTA; the arrow
          is purely visual. Hides on any slide change (back, dot, next). */}
      {idx === 0 && !isSingleSlide && (
        <div className="slide-tap-hint-wrap" aria-hidden="true">
          <div className="slide-tap-hint">
            <svg
              className="slide-tap-hint-arrow"
              width="40"
              height="40"
              viewBox="0 0 32 32"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 6 L16 24 M10 18 L16 24 L22 18" />
            </svg>
          </div>
        </div>
      )}

      {/* Single-slide decks (e.g. a one-video brand tour) have nothing
          to page through, so Back / Next / dots / counter are hidden. */}
      {!isSingleSlide && (
      <div className="slide-controls">
        <button
          type="button"
          className="slide-nav-btn"
          onClick={goPrev}
          disabled={idx === 0}
        >
          ← Back
        </button>

        <div className="slide-dots" role="tablist">
          {Array.from({ length: slides.length }).map((_, i) => {
            const cls = [
              "slide-dot",
              i === idx && "active",
              i < idx && "done",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={i}
                type="button"
                className={cls}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                aria-current={i === idx ? "true" : undefined}
              />
            );
          })}
        </div>

        {/* PR 120: mobile counter — dots overflow on narrow viewports
            when slide count is high. CSS swaps the dots row for this
            text counter at ≤768px so the Next button stays on-screen.
            Both elements render; CSS picks the right one per width. */}
        <span
          className="slide-counter-text"
          aria-live="polite"
          aria-label={`Slide ${idx + 1} of ${slides.length}`}
        >
          {idx + 1} / {slides.length}
        </span>

        {/* Next is hidden on the last slide via the `hidden` attribute
            (display: none, so it leaves the layout). It was the last
            grid item, so Back and the dots/counter don't move. The
            completion splash takes over from here. */}
        <button
          type="button"
          className="slide-nav-btn primary"
          onClick={goNext}
          disabled={isLastSlide}
          hidden={isLastSlide}
          aria-hidden={isLastSlide ? true : undefined}
        >
          Next →
        </button>
      </div>
      )}

      {/* Plain Continue that opens the completion splash. Rendered only
          when there's nothing else to wait for: a one-slide IMAGE deck
          (not expected in current configs — no Next, no video end), or
          a last-slide video that failed to load and so will never fire
          `ended`. */}
      {showFallbackContinue && (
        <div className="slides-continue-row">
          <button
            type="button"
            className="slides-continue-cta"
            onClick={() => setShowSplash(true)}
            disabled={disabled}
          >
            Continue →
          </button>
        </div>
      )}

      {pendingVideo && (
        <StepTransitionVideoPopup
          key={pendingVideo.stepId}
          config={pendingVideo}
          onDismiss={handleTransitionVideoDismiss}
          onDismissed={handleTransitionVideoDismissed}
        />
      )}
    </div>
  );
}

interface SlideVideoProps {
  src: string;
  poster: string | null;
  hasSound: boolean;
  reduceMotion: boolean;
  /** Fires when the video plays through to its end. On the last slide
   *  this shows the tour completion splash. */
  onEnded?: () => void;
  /** The video can't be played: `error` on the element, play()
   *  rejected as unsupported, or it stalled before loading any data. */
  onLoadFailed?: () => void;
  /** Metadata loaded after a stall-based failure — the video is fine
   *  after all. */
  onLoadRecovered?: () => void;
}

// Keys that seek or change speed if the <video> ever ends up focused.
const BLOCKED_VIDEO_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "j",
  "l",
  ">",
  "<",
  ".",
  ",",
]);

// Slack for the forward-seek guard: timeupdate fires every ~250ms, so
// a legitimate position can sit slightly ahead of the last recorded
// max. Anything further ahead than this is treated as a skip.
const SEEK_TOLERANCE_S = 1.5;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Custom, non-scrubbable video player for tour slides.
//
// Playback rule (unchanged from PR 125/134): has_sound=true → starts
// paused, candidate presses play (with sound). has_sound!==true →
// ambient: always muted, started with an imperative .play() (iOS can
// silently ignore the autoPlay attribute), unless the candidate prefers
// reduced motion. If the browser blocks that .play() (iPhone low-power
// mode etc.) the video just sits paused with the play button showing.
//
// There is no native `controls` attribute, so there is no scrub bar.
// Our overlay is play/pause + a progress bar the candidate can't drag +
// elapsed/total time. Every video gets the overlay (including ambient)
// so there is always a visible way to start — and to pause motion.
//
// Anti-skip is deterrence, not a lock: disablePictureInPicture,
// controlsList, blocked context menu (Chrome/Firefox "Show controls"
// would bring the native scrub bar back), playsInline (iOS fullscreen
// has its own scrubber), seek keys swallowed, playback speed pinned to
// 1x, and any forward jump past what's been watched is snapped back.
// Someone determined (devtools, downloading the file) can still get
// around it.
function SlideVideo({
  src,
  poster,
  hasSound,
  reduceMotion,
  onEnded,
  onLoadFailed,
  onLoadRecovered,
}: SlideVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isAmbient = !hasSound;
  const shouldAutoplay = isAmbient && !reduceMotion;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Furthest point legitimately reached. Seeking backwards is fine;
  // seeking past this is snapped back.
  const maxWatchedRef = useRef(0);
  // True once the candidate has pressed play themselves, so a late
  // reduced-motion flip doesn't pause a video they chose to start.
  const userStartedRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!shouldAutoplay) {
      // useReducedMotion() starts false and flips after mount, so an
      // ambient video may already be auto-playing. Stop it unless the
      // candidate started it.
      if (isAmbient && !userStartedRef.current && !v.paused) v.pause();
      return;
    }
    v.play().catch((err) => {
      // Blocked despite muted. The play button stays visible, so the
      // candidate can start it themselves. An unsupported / missing
      // source is a load failure, not an autoplay block.
      console.warn("[SlideVideo] autoplay blocked:", err);
      if (err?.name === "NotSupportedError") onLoadFailed?.();
    });
  }, [shouldAutoplay, isAmbient, src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      userStartedRef.current = true;
      v.play().catch((err) => {
        console.warn("[SlideVideo] play failed:", err);
        if (err?.name === "NotSupportedError") onLoadFailed?.();
      });
    } else {
      v.pause();
    }
  };

  const syncDuration = () => {
    const d = videoRef.current?.duration ?? 0;
    setDuration(Number.isFinite(d) && d > 0 ? d : 0);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    // Normal playback advances the watched mark. Seeks never reach
    // here un-checked: handleSeeking runs first and snaps a forward
    // jump back. (No step-size limit here on purpose — a throttled
    // background tab can legitimately skip several seconds between
    // timeupdates, and we must never strand the candidate.)
    if (!v.seeking && v.currentTime > maxWatchedRef.current) {
      maxWatchedRef.current = v.currentTime;
    }
    setCurrentTime(v.currentTime);
  };

  const handleSeeking = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxWatchedRef.current + SEEK_TOLERANCE_S) {
      v.currentTime = maxWatchedRef.current;
    }
  };

  const handleRateChange = () => {
    const v = videoRef.current;
    if (v && v.playbackRate !== 1) v.playbackRate = 1;
  };

  const handleEnded = () => {
    setPlaying(false);
    onEnded?.();
  };

  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="slide-video">
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        preload="metadata"
        muted={isAmbient}
        width={1280}
        height={720}
        disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (BLOCKED_VIDEO_KEYS.has(e.key)) e.preventDefault();
        }}
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={() => {
          syncDuration();
          onLoadRecovered?.();
        }}
        onDurationChange={syncDuration}
        onError={() => {
          console.warn("[SlideVideo] video failed to load:", src);
          onLoadFailed?.();
        }}
        onStalled={() => {
          // `stalled` = the browser has been waiting ~3s for data. Only
          // treat it as a failure if NOTHING has loaded yet
          // (HAVE_NOTHING); a mid-playback stall is just buffering. If
          // metadata arrives later, onLoadedMetadata un-fails it.
          const v = videoRef.current;
          if (v && v.readyState === 0) onLoadFailed?.();
        }}
        onTimeUpdate={handleTimeUpdate}
        onSeeking={handleSeeking}
        onRateChange={handleRateChange}
        onEnded={handleEnded}
      />
      <div className="slide-video-controls">
        <button
          type="button"
          className="slide-video-btn"
          onClick={togglePlay}
          aria-label={playing ? "Pause video" : "Play video"}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div
          className="slide-video-progress"
          role="progressbar"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="slide-video-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="slide-video-time" aria-hidden="true">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
