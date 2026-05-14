"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
  stepTransitionVideo = null,
  onDismissStepTransitionVideo,
}: Props) {
  const [idx, setIdx] = useState(0);
  const [pendingVideo, setPendingVideo] =
    useState<StepTransitionVideoConfig | null>(null);
  const reduceMotion = useReducedMotion();
  const rendererRef = useRef<HTMLDivElement | null>(null);
  // Skip the initial-mount scroll: candidates lifting into the slides
  // step may have intentional scroll position (e.g., reading the
  // journey card below); jumping them to the top on mount would feel
  // jarring. Subsequent slide changes are the ones we want to reset.
  const didInitialMountRef = useRef(false);

  // Reset scroll on every slide change. Use scrollIntoView on the
  // renderer's outer container so this works whether the window
  // scrolls (today) or some ancestor (future cinematic-shell
  // refactor). `block: "start"` lands the slide heading at the top
  // of the viewport, which is what candidates expect after Next /
  // Back / dot navigation.
  useEffect(() => {
    if (!didInitialMountRef.current) {
      didInitialMountRef.current = true;
      return;
    }
    rendererRef.current?.scrollIntoView({
      block: "start",
      behavior: "auto",
    });
  }, [idx]);

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

  // The handoff CTA does one of two things:
  //   1. If a step transition video is configured for this step and
  //      hasn't been dismissed yet, surface it inline before advancing.
  //      The "Setting things up…" loader stays out of the way until
  //      after the video closes — the video itself is the loading
  //      gesture in that case.
  //   2. Otherwise fall through to the existing 700ms loader → advance.
  const finish = () => {
    if (transitioning || disabled) return;
    if (stepTransitionVideo && !pendingVideo) {
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

  return (
    <div className="slides-renderer" ref={rendererRef}>
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
              <SlideVideo
                key={slide!.id}
                src={slide!.video_url}
                poster={slide!.poster_url ?? null}
                hasSound={slide!.has_sound === true}
                reduceMotion={reduceMotion}
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
            // <div> wrapper (not <p>) so the sanitized HTML can contain
            // its own <p> elements — TipTap emits one paragraph per
            // block, and per-paragraph text-align lives on those inner
            // <p>s. A <p> inside a <p> would auto-close the outer and
            // strip the size class.
            <div
              className={`slide-caption slide-caption--${slide!.caption_size ?? "md"}`}
              // Caption is sanitized server-side at save time
              // (sanitizeCaptionHtml in app/admin/content/actions.ts) —
              // only <strong>, <em>, <a href>, and <p style="text-align">
              // survive. Existing plain-text captions render as-is.
              dangerouslySetInnerHTML={{
                __html: applySlideTemplate(slide!.caption, candidate ?? {}),
              }}
            />
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
}

// Per-slide-instance video state — re-mounts on slide change (parent
// passes `key={slide.id}`), so muted/hasStarted are fresh each time.
function SlideVideo({ src, poster, hasSound, reduceMotion }: SlideVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  // Gate the overlay on playback start so it doesn't flash up on the
  // poster frame before anything happens — the pill only makes sense
  // once audio could actually be playing.
  const [hasStarted, setHasStarted] = useState(false);

  const showOverlay = hasSound && muted && hasStarted;

  const unmute = () => {
    const el = ref.current;
    if (el) el.muted = false;
    setMuted(false);
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        autoPlay={!reduceMotion}
        muted={muted}
        onPlay={() => setHasStarted(true)}
        // Sync local muted state when the user toggles via the browser's
        // native controls — otherwise the overlay would stay visible
        // after unmuting through the speaker icon.
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        width={1280}
        height={720}
      />
      {hasSound && (
        <button
          type="button"
          className={`tap-for-sound${showOverlay ? " is-visible" : ""}`}
          onClick={unmute}
          aria-label="Tap for sound"
          aria-hidden={!showOverlay}
          tabIndex={showOverlay ? 0 : -1}
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
    </>
  );
}
