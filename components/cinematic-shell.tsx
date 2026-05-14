"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { SlidesRenderer, type Slide } from "@/components/content-types/slides-renderer";
import {
  ApplicationRenderer,
  type ApplicationCandidate,
} from "@/components/content-types/application-renderer";
import {
  VideoRenderer,
  type VideoConfig,
} from "@/components/content-types/video-renderer";
import {
  ScheduleRenderer,
  type ExistingBooking,
} from "@/components/content-types/schedule-renderer";
import { ContentCardStrip } from "@/components/content-cards/content-card-strip";
import type { ContentCard } from "@/components/content-cards/types";
import {
  formatDayLabel,
  formatTimeLabel,
  type ScheduleConfig,
  type Slot,
} from "@/lib/schedule-shared";
import {
  JourneyCard,
  ChapterProgress,
  type JourneyCardState,
} from "@/components/sidebar/journey-card";
import {
  ChapterIntroBanner,
  type ChapterIntroBannerConfig,
} from "@/components/portal/chapter-intro-banner";
import {
  StepTransitionPopup,
  type StepTransitionPopupConfig,
} from "@/components/portal/step-transition-popup";
import {
  StepTransitionVideoPopup,
  type StepTransitionVideoConfig,
} from "@/components/portal/step-transition-video-popup";
import { YoureCurrentScreen } from "@/components/portal/youre-current-screen";
import { BackToTop } from "@/components/portal/back-to-top";
import { ScrollDownHint } from "@/components/portal/scroll-down-hint";
import type { ClientLogEventArgs } from "@/app/portal/[token]/event-actions";

// Default logo height for all brands. Per-brand overrides below.
const DEFAULT_LOGO_HEIGHT = 60;

// Per-brand logo height overrides, keyed by brands.slug. Add an entry here
// when a brand's horizontal wordmark reads visually small/large at the
// default height and needs tuning.
const LOGO_HEIGHT_OVERRIDE: Record<string, number> = {
  "cruisin-tikis": 68,
};

export type ContentType =
  | "slides"
  | "static"
  | "application"
  | "schedule"
  | "video"
  | "document"
  | "checklist";

export interface Chapter {
  chapter_key: string;
  position: number;
  label: string;
  name: string;
  icon: string | null;
}

export interface Step {
  id: string;
  step_key: string;
  chapter_key: string;
  position: number;
  label: string;
  description: string;
  content_type: ContentType;
  config: Record<string, unknown>;
  content_cards: ContentCard[];
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  dark: string;
  soft: string;
}

export interface BrandTypography {
  headingFontVar: string;
  bodyFontVar: string;
  headingWeight: string;
  headingTransform: "none" | "uppercase";
}

export interface ShellProps {
  brandName: string;
  brandSlug: string;
  brandMarkHtml: string;
  logoUrl: string | null;
  colors: BrandColors;
  palette: Record<string, string>;
  typography: BrandTypography;
  leader: {
    name: string;
    role: string;
    email: string;
  };
  journeyState: JourneyCardState;
  heroStats: Array<{ num: string; label: string }>;
  heroStripHeading: string;
  chapters: Chapter[];
  stepsByChapter: Record<string, Step[]>;
  currentChapterIdx: number;
  initialChapterIdx: number;
  initialStepIdx: number;
  // Bound server actions — page binds the candidate's token into each.
  onTourComplete: (nextStepIdx: number, chapterKey: string) => Promise<void>;
  onStepAdvance: (nextStepIdx: number) => Promise<void>;
  onSaveApplicationAnswer: (
    fieldKey: string,
    fieldValue: unknown,
  ) => Promise<void>;
  onSubmitApplication: (finalAnswers: Record<string, unknown>) => Promise<void>;
  onGetSlots: (stepId: string) => Promise<{
    configured: boolean;
    slots: Slot[];
    error?: string;
  }>;
  onBookSlot: (
    stepId: string,
    slotIso: string,
  ) => Promise<{
    id: string;
    start_time: string;
    end_time: string;
    meeting_url: string | null;
  }>;
  onCancelBooking: (bookingId: string) => Promise<void>;
  /** PR 40: scheduling escape hatch action — bound by the page with the
   *  candidate's token. Stores a pending row in
   *  booking_unavailable_requests. */
  onSubmitBookingUnavailable: (
    email: string,
    availableTimes: string,
    notes: string,
  ) => Promise<{ success: boolean; error?: string }>;
  // Application runtime inputs
  candidate: ApplicationCandidate;
  initialApplicationAnswers: Record<string, unknown>;
  isApplicationSubmitted: boolean;
  /** ZIP prefilled at candidate creation time (PR 37). When set, the
   *  application's location step skips the cold ZIP input and lands on
   *  the confirmation card. */
  prefilledZip: string | null;
  /** Phone number prefilled at candidate creation time (PR 42). Mirrors
   *  prefilledZip — application's verification screen pre-populates and
   *  shows a "Prefilled from your record" hint. */
  prefilledPhone: string | null;
  // Schedule content-type inputs
  bookingsByStepId: Record<string, ExistingBooking>;
  hasAssignedRep: boolean;
  advisorName: string | null;
  advisorEmail: string | null;
  brandShortName: string;
  isGCalConfigured: boolean;
  /**
   * Per-chapter intro banner config, keyed by chapter_key. Only chapters
   * whose admin entry has show_as_banner = true and is_active = true appear
   * in this map. Chapters without a banner are simply absent. Banner state
   * (collapsed / read-more) lives in the banner component itself.
   */
  bannersByChapterKey: Record<string, ChapterIntroBannerConfig>;
  /**
   * Per-step transition popup config, keyed by step_id. Only steps that
   * have an active step_transition_popup row appear here. Each is shown
   * at most once per candidate — gated by initialDismissedStepTransitions
   * plus local dismissals.
   */
  transitionsByStepId: Record<string, StepTransitionPopupConfig>;
  initialDismissedStepTransitions: string[];
  onDismissStepTransition: (
    stepId: string,
  ) => Promise<{ success: boolean }>;
  /**
   * Per-step transition VIDEO config, keyed by step_id. Plays full-screen
   * before the matching popup (if both are configured for the same step).
   * Dismissed via Continue button and tracked in
   * initialDismissedStepTransitionVideos.
   */
  transitionVideosByStepId: Record<string, StepTransitionVideoConfig>;
  initialDismissedStepTransitionVideos: string[];
  onDismissStepTransitionVideo: (
    stepId: string,
  ) => Promise<{ success: boolean }>;
  /**
   * Server-supplied "fire this video on mount" hint. Set by the portal
   * page when candidates_in_portal.last_visited_step_id points at a
   * step with an active, not-yet-dismissed transition video. Needed
   * because the in-content Next path calls router.refresh() which
   * remounts the shell — the in-memory step-change effect can't
   * observe the departure across that boundary.
   */
  pendingTransitionVideoStepId: string | null;
  /**
   * Steps completed within the candidate's CURRENT chapter — derived from
   * server-side current_step (clamped). Drives the chapter progress bar in
   * the sidebar.
   */
  currentChapterCompletedSteps: number;
  /**
   * PR 54: token-bound tracking handler. Resolves candidate + brand
   * server-side from the portal token, so client components fire events
   * without ever holding either id. Best-effort: failures are swallowed
   * server-side and never surfaced.
   */
  onLogEvent: (args: ClientLogEventArgs) => Promise<void>;
}

export function CinematicShell({
  brandName,
  brandSlug,
  brandMarkHtml,
  logoUrl,
  colors,
  palette,
  typography,
  leader,
  journeyState,
  heroStats,
  heroStripHeading,
  chapters,
  stepsByChapter,
  currentChapterIdx,
  initialChapterIdx,
  initialStepIdx,
  onTourComplete,
  onStepAdvance,
  onSaveApplicationAnswer,
  onSubmitApplication,
  onGetSlots,
  onBookSlot,
  onCancelBooking,
  onSubmitBookingUnavailable,
  candidate,
  initialApplicationAnswers,
  isApplicationSubmitted,
  prefilledZip,
  prefilledPhone,
  bookingsByStepId,
  hasAssignedRep,
  advisorName,
  advisorEmail,
  brandShortName,
  isGCalConfigured,
  bannersByChapterKey,
  transitionsByStepId,
  initialDismissedStepTransitions,
  onDismissStepTransition,
  transitionVideosByStepId,
  initialDismissedStepTransitionVideos,
  onDismissStepTransitionVideo,
  pendingTransitionVideoStepId,
  currentChapterCompletedSteps,
  onLogEvent,
}: ShellProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(initialChapterIdx);
  const [selectedStepIdx, setSelectedStepIdx] = useState(initialStepIdx);

  const selectedChapter = chapters[selectedChapterIdx];
  const steps = stepsByChapter[selectedChapter.chapter_key] ?? [];
  const selectedStep = steps[Math.min(selectedStepIdx, steps.length - 1)] ?? null;

  // --- Step transition popup ---
  // Track dismissed step ids locally, seeded from the server. Add to this
  // set on dismiss so we don't re-fire the same toast within a session even
  // before the page revalidates.
  const [dismissedStepIds, setDismissedStepIds] = useState<Set<string>>(
    () => new Set(initialDismissedStepTransitions),
  );
  const [dismissedStepVideoIds, setDismissedStepVideoIds] = useState<
    Set<string>
  >(() => new Set(initialDismissedStepTransitionVideos));
  const [activeTransition, setActiveTransition] =
    useState<StepTransitionPopupConfig | null>(null);
  const [activeTransitionVideo, setActiveTransitionVideo] =
    useState<StepTransitionVideoConfig | null>(null);
  const isFirstStepRender = useRef(true);
  // Track which step we last landed on, so navigating back to the same step
  // (within a chapter) doesn't refire. Seeded with the initial step id so
  // a fresh page load never fires.
  const lastStepIdRef = useRef<string | null>(selectedStep?.id ?? null);

  // When a video fires on a step transition, remember which step the
  // candidate was ARRIVING AT so the chained popup (handled in
  // handleTransitionVideoDismissed below) keys on that step rather
  // than the step the video was attached to. The video itself is
  // attached to — and dismissed for — the step the candidate is
  // LEAVING (see effect below).
  const pendingTransitionPopupStepIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedStep) return;
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      lastStepIdRef.current = selectedStep.id;
      return;
    }
    if (lastStepIdRef.current === selectedStep.id) return;

    // Capture which step we're LEAVING before we update the ref to the
    // new one. Step transition videos are attached to the step the
    // candidate is DEPARTING from — fire it between steps, not on
    // arrival. This matches chapter video semantics and the original
    // "between steps" intent.
    const previousStepId = lastStepIdRef.current;
    lastStepIdRef.current = selectedStep.id;

    if (!previousStepId) {
      // No previous step (shouldn't happen after the first-render
      // guard, but belt-and-suspenders). Fall through to popup-only.
      const popupConfig = transitionsByStepId[selectedStep.id];
      if (popupConfig && !dismissedStepIds.has(selectedStep.id)) {
        setActiveTransition(popupConfig);
      }
      return;
    }

    // Step transitions: VIDEO first (attached to the step we're
    // leaving), then popup (attached to the step we're arriving at).
    const videoConfig = transitionVideosByStepId[previousStepId];
    if (videoConfig && !dismissedStepVideoIds.has(previousStepId)) {
      // Remember the arrival step so the dismiss chain can look up
      // the right popup config after the video closes.
      pendingTransitionPopupStepIdRef.current = selectedStep.id;
      setActiveTransitionVideo(videoConfig);
      return;
    }

    const popupConfig = transitionsByStepId[selectedStep.id];
    if (!popupConfig) return;
    if (dismissedStepIds.has(selectedStep.id)) return;
    setActiveTransition(popupConfig);
  }, [
    selectedStep,
    transitionsByStepId,
    transitionVideosByStepId,
    dismissedStepIds,
    dismissedStepVideoIds,
  ]);

  // Mount-time companion to the step-change effect above. The in-memory
  // effect can't fire the video when the advance was driven by a server
  // action that calls router.refresh() — the shell remounts, the
  // isFirstStepRender guard short-circuits, and the departure step
  // info is lost. The portal page detects that case server-side via
  // candidates_in_portal.last_visited_step_id and surfaces it here as
  // pendingTransitionVideoStepId. This effect consumes it exactly once
  // per mount.
  const pendingVideoConsumedRef = useRef(false);
  useEffect(() => {
    if (pendingVideoConsumedRef.current) return;
    if (!pendingTransitionVideoStepId) return;
    const videoConfig =
      transitionVideosByStepId[pendingTransitionVideoStepId];
    if (!videoConfig) return;
    if (dismissedStepVideoIds.has(pendingTransitionVideoStepId)) return;

    pendingVideoConsumedRef.current = true;
    // The pending step is the DEPARTURE step. Capture the current
    // selected step as the arrival so the dismiss chain can still
    // queue a matching popup if one is configured.
    if (selectedStep) {
      pendingTransitionPopupStepIdRef.current = selectedStep.id;
    }
    setActiveTransitionVideo(videoConfig);
  }, [
    pendingTransitionVideoStepId,
    transitionVideosByStepId,
    dismissedStepVideoIds,
    selectedStep,
  ]);

  const handleTransitionDismiss = async (stepId: string) => {
    // Optimistic local state — once dismissed, never re-fire this session.
    setDismissedStepIds((prev) => {
      if (prev.has(stepId)) return prev;
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
    return onDismissStepTransition(stepId);
  };

  const handleTransitionVideoDismiss = async (stepId: string) => {
    setDismissedStepVideoIds((prev) => {
      if (prev.has(stepId)) return prev;
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
    return onDismissStepTransitionVideo(stepId);
  };

  const handleTransitionVideoDismissed = () => {
    // Video is keyed on the DEPARTURE step (see effect above), but the
    // popup is keyed on the ARRIVAL step — that's what the candidate
    // is about to see. Use the arrival step id captured when the
    // video fired, not activeTransitionVideo.stepId.
    const arrivalStepId = pendingTransitionPopupStepIdRef.current;
    pendingTransitionPopupStepIdRef.current = null;
    setActiveTransitionVideo(null);
    if (!arrivalStepId) return;
    const popupConfig = transitionsByStepId[arrivalStepId];
    if (popupConfig && !dismissedStepIds.has(arrivalStepId)) {
      setActiveTransition(popupConfig);
    }
  };

  // PR 54: tracking. Fire `step_viewed` whenever the candidate lands on a
  // new step, and additionally fire `application_started` (milestone) the
  // first time they land on the application step within this shell mount.
  // Dedup is per-shell-mount: a full page reload may re-fire
  // application_started, but the milestone Zoho update is idempotent
  // (Portal_Status set to "Application Started" twice = same end state).
  //
  // PR 60: `education_completed` is a separate signal — "watched the
  // whole brand pitch" — and fires from the slides renderer when the
  // candidate views the last slide of explore/tour. Keeping the two
  // milestones distinct lets sales see the gap between them as a
  // stalled-after-education signal. See `handleEducationCompleted`
  // below.
  const lastTrackedStepIdRef = useRef<string | null>(null);
  const startedApplicationStepIdsRef = useRef<Set<string>>(new Set());
  const firedEducationCompletedRef = useRef(false);
  useEffect(() => {
    if (!selectedStep) return;
    if (lastTrackedStepIdRef.current === selectedStep.id) return;
    lastTrackedStepIdRef.current = selectedStep.id;

    void onLogEvent({
      category: "engagement",
      eventType: "step_viewed",
      eventKey: selectedStep.step_key,
      metadata: {
        chapter_key: selectedStep.chapter_key,
        step_id: selectedStep.id,
        content_type: selectedStep.content_type,
      },
    });

    if (
      selectedStep.content_type === "application" &&
      !startedApplicationStepIdsRef.current.has(selectedStep.id)
    ) {
      startedApplicationStepIdsRef.current.add(selectedStep.id);
      void onLogEvent({
        category: "milestone",
        eventType: "application_started",
        eventKey: selectedStep.step_key,
        metadata: { chapter_key: selectedStep.chapter_key },
      });
    }
  }, [selectedStep, onLogEvent]);

  // PR 60: invoked by the slides renderer when the candidate views the
  // last slide of the explore/tour deck. Per-mount dedup via the ref;
  // the Zoho Portal_Status write is idempotent on subsequent fires
  // (same end state), and the Blueprint transition fails benignly when
  // the lead is already past New, so this matches the
  // application_started reliability model.
  const handleEducationCompleted = useCallback(() => {
    if (firedEducationCompletedRef.current) return;
    firedEducationCompletedRef.current = true;
    void onLogEvent({
      category: "milestone",
      eventType: "education_completed",
      eventKey: "explore",
      metadata: { trigger: "tour_last_slide_viewed" },
    });
  }, [onLogEvent]);

  // Sync the user's view to the server's current chapter when it advances.
  // PR 36: completing a chapter via the chapter complete popup bumps
  // current_chapter server-side, but useState ignores prop changes. Without
  // this effect, the user would still see their old chapter in the shell
  // even after the popup closes and the journey moved forward.
  //
  // The sidebar still lets candidates browse to past chapters; manually
  // selecting only changes selectedChapterIdx, not currentChapterIdx, so
  // this effect doesn't fight that — it only fires when the SERVER bumps
  // current_chapter.
  useEffect(() => {
    setSelectedChapterIdx(currentChapterIdx);
    setSelectedStepIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChapterIdx]);

  const completedCount = currentChapterIdx;
  const progressPct = Math.round((completedCount / chapters.length) * 100);
  const weeksLeft = Math.max(2, chapters.length - completedCount + 1);

  const logoHeight = LOGO_HEIGHT_OVERRIDE[brandSlug] ?? DEFAULT_LOGO_HEIGHT;

  const handleTourComplete = () => {
    // Allow advancing one past the last step — that sentinel triggers the
    // chapter complete popup on next render. The renderer falls back to the
    // last step's content via Math.min so the user briefly sees the last
    // step behind the popup.
    const nextIdx = Math.min(selectedStepIdx + 1, steps.length);
    setSelectedStepIdx(nextIdx);
    // chapterKey is what the server uses to scope the
    // 'education_completed' milestone to the Explore chapter (PR 57).
    const chapterKey = selectedChapter.chapter_key;
    startTransition(async () => {
      await onTourComplete(nextIdx, chapterKey);
      router.refresh();
    });
  };

  // For non-tour steps (video, schedule) that just need to advance without
  // flipping the is_tour_complete flag. Same past-the-last-step semantics.
  const handleStepAdvance = () => {
    const nextIdx = Math.min(selectedStepIdx + 1, steps.length);
    setSelectedStepIdx(nextIdx);
    startTransition(async () => {
      await onStepAdvance(nextIdx);
      router.refresh();
    });
  };

  // Called from the success screen of the application renderer. The server
  // (PR 36) no longer advances current_chapter on submit — it just bumps
  // current_step past the last step so the chapter complete popup fires.
  // Don't change selected*Idx locally; refresh so the new server props
  // (chapterComplete config + step sentinel) flow in and OnboardingPopups
  // takes over.
  const handleContinueAfterApplication = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const shellStyle: Record<string, string> = {
    "--brand-primary": colors.primary,
    "--brand-secondary": colors.secondary,
    "--brand-accent": colors.accent,
    "--brand-dark": colors.dark,
    "--brand-soft": colors.soft,
    "--font-heading": typography.headingFontVar,
    "--font-body": typography.bodyFontVar,
    "--heading-weight": typography.headingWeight,
    "--heading-transform": typography.headingTransform,
  };
  for (const [name, value] of Object.entries(palette)) {
    shellStyle[`--brand-palette-${name.replace(/_/g, "-")}`] = value;
  }

  return (
    <>
    <div
      className="portal-cinematic"
      data-brand-slug={brandSlug}
      style={shellStyle as CSSProperties}
    >
      <aside className="cine-sidebar">
        <div className="cine-brand">
          {logoUrl ? (
            <Image
              className="cine-brand-logo"
              src={logoUrl}
              alt={brandName}
              width={480}
              height={180}
              priority
              style={{ height: logoHeight, width: "auto" }}
            />
          ) : (
            <div
              className="cine-brand-mark"
              dangerouslySetInnerHTML={{ __html: brandMarkHtml }}
            />
          )}
          <p className="cine-brand-sub">Franchise Discovery Portal</p>
          {/* PR 59: persistent greeting addressed to the candidate.
              Renders on every page since it lives in the always-visible
              sidebar. Falls back to "Hi there" so an unnamed candidate
              still gets a warm hello rather than an empty greeting. */}
          <p className="cine-greeting">
            {candidate.first_name?.trim()
              ? `Hi, ${candidate.first_name.trim()}`
              : "Hi there"}
          </p>
        </div>

        <div className="cine-progress">
          <div className="cine-progress-head">
            <div className="cine-progress-label">Your journey</div>
            <div className="cine-progress-pct">{progressPct}%</div>
          </div>
          <div className="cine-progress-bar">
            <div
              className="cine-progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="cine-progress-meta">
            <span>
              {completedCount} of {chapters.length} chapters
            </span>
            <span>
              {completedCount === chapters.length
                ? "Complete"
                : `~${weeksLeft} weeks left`}
            </span>
          </div>
        </div>

        {chapters[currentChapterIdx] &&
          (stepsByChapter[chapters[currentChapterIdx].chapter_key]?.length ?? 0) >
            0 && (
            <ChapterProgress
              chapterLabel={chapters[currentChapterIdx].label}
              chapterNumber={currentChapterIdx + 1}
              completed={currentChapterCompletedSteps}
              total={
                stepsByChapter[chapters[currentChapterIdx].chapter_key]
                  ?.length ?? 0
              }
            />
          )}

        <div className="cine-chapters">
          {chapters.map((chapter, i) => {
            const isDone = i < currentChapterIdx;
            const isCurrent = i === currentChapterIdx;
            const isLocked = i > currentChapterIdx;
            const isActive = selectedChapterIdx === i;
            const clickable = isDone || isCurrent;
            // PR 44: even the candidate's CURRENT chapter is rendered as
            // "locked" in the sidebar when it has no active steps yet.
            // Tells the candidate "you're here but the next part is
            // still coming together" — matches the YoureCurrentScreen
            // they see in the main content area.
            const noActiveSteps =
              (stepsByChapter[chapter.chapter_key]?.length ?? 0) === 0;
            const showLockIcon = isLocked || (isCurrent && noActiveSteps);

            const cls = [
              "cine-chapter",
              isDone && "done",
              isCurrent && "current",
              isLocked && "locked",
              isActive && "active",
              isCurrent && noActiveSteps && "locked-current",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={chapter.chapter_key}
                className={cls}
                title={chapter.name}
                disabled={!clickable}
                onClick={() => {
                  if (!clickable) return;
                  setSelectedChapterIdx(i);
                  setSelectedStepIdx(0);
                }}
              >
                <span className="cine-chapter-icon">{chapter.icon ?? "•"}</span>
                <span className="cine-chapter-label">{chapter.label}</span>
                <span className="cine-chapter-status">
                  {isDone ? (
                    <CheckIcon />
                  ) : showLockIcon ? (
                    <LockIcon />
                  ) : (
                    <DotIcon />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <JourneyCard state={journeyState} />

        {hasAssignedRep && advisorName && (
          <div className="cine-advisor">
            <div className="cine-advisor-eyebrow">Your guide</div>
            <h4 className="cine-advisor-name">{advisorName}</h4>
            <p className="cine-advisor-sub">from {brandShortName}</p>
            {advisorEmail && (
              <p className="cine-advisor-email">
                <a href={`mailto:${advisorEmail}`}>{advisorEmail}</a>
              </p>
            )}
          </div>
        )}
      </aside>

      <section className="cine-content">
        {selectedChapter.chapter_key === "explore" && heroStats.length > 0 && (
          <div className="cine-hero-strip">
            <div className="cine-hero-strip-heading">{heroStripHeading}</div>
            <div className="cine-hero-strip-grid">
              {heroStats.map((s, i) => (
                <div key={i} className="cine-hero-strip-stat">
                  <div className="cine-hero-strip-num">{s.num}</div>
                  <div className="cine-hero-strip-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {steps.length > 0 && (
          <div className="cine-stepbar">
            <div className="cine-stepbar-head">
              <div className="cine-stepbar-title">
                Chapter {selectedChapterIdx + 1} ·{" "}
                <strong>{selectedChapter.name}</strong>
              </div>
              {/* Hide the step count for single-step chapters — "1 step"
                  reads awkward, and the steps grid below is hidden too. */}
              {steps.length > 1 && (
                <div className="cine-stepbar-count">
                  {steps.length} steps
                </div>
              )}
            </div>
            {/* Single-step chapters skip the steps grid entirely. The
                chapter title above is enough framing; the persistent intro
                banner provides the rest. PR 38 made Chapter 2 single-step. */}
            {steps.length > 1 && (
              <div className="cine-steps">
                {steps.map((step, i) => {
                  const chapterIsDone = selectedChapterIdx < currentChapterIdx;
                  const isDone =
                    chapterIsDone ||
                    (selectedChapterIdx === currentChapterIdx && i < selectedStepIdx);
                  const isActive = selectedStepIdx === i;
                  const cls = [
                    "cine-step",
                    isDone && "done",
                    isActive && "active",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <button
                      key={step.step_key}
                      className={cls}
                      onClick={() => setSelectedStepIdx(i)}
                    >
                      <span className="cine-step-num">
                        {isDone ? <CheckIcon small /> : i + 1}
                      </span>
                      <span className="cine-step-body">
                        <span className="cine-step-label">{step.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {bannersByChapterKey[selectedChapter.chapter_key] && (
          <ChapterIntroBanner
            // Re-key per chapter so collapse/expand state resets when the
            // candidate moves between chapters.
            key={selectedChapter.chapter_key}
            config={bannersByChapterKey[selectedChapter.chapter_key]}
          />
        )}

        <div className="cine-step-content">
          {selectedStep ? (
            <>
              <StepRenderer
                step={selectedStep}
                stepsInChapter={steps}
                chapterNumber={selectedChapterIdx + 1}
                currentChapterKey={
                  chapters[currentChapterIdx]?.chapter_key ?? null
                }
                onTourComplete={handleTourComplete}
                onStepAdvance={handleStepAdvance}
                onLogEvent={onLogEvent}
                onEducationCompleted={handleEducationCompleted}
                tourPending={pending}
                candidate={candidate}
                leaderName={leader.name}
                brandName={brandName}
                initialApplicationAnswers={initialApplicationAnswers}
                isApplicationSubmitted={isApplicationSubmitted}
                prefilledZip={prefilledZip}
                prefilledPhone={prefilledPhone}
                brandSlug={brandSlug}
                onSaveApplicationAnswer={onSaveApplicationAnswer}
                onSubmitApplication={onSubmitApplication}
                onContinueAfterApplication={handleContinueAfterApplication}
                bookingsByStepId={bookingsByStepId}
                hasAssignedRep={hasAssignedRep}
                advisorName={advisorName}
                brandShortName={brandShortName}
                isGCalConfigured={isGCalConfigured}
                onGetSlots={onGetSlots}
                onBookSlot={onBookSlot}
                onCancelBooking={onCancelBooking}
                onSubmitBookingUnavailable={onSubmitBookingUnavailable}
                stepTransitionVideo={(() => {
                  // Inline trigger for the slides handoff. Reuses the
                  // same transitionVideosByStepId map + local
                  // dismissedStepVideoIds set the cinematic-shell's
                  // effect-based trigger uses, so the two paths stay
                  // consistent. If the video has already been
                  // dismissed (server seed + this session's local
                  // dismisses), pass null and the slides renderer
                  // calls onComplete directly.
                  const cfg = transitionVideosByStepId[selectedStep.id];
                  if (!cfg) return null;
                  if (dismissedStepVideoIds.has(selectedStep.id)) return null;
                  return cfg;
                })()}
                onDismissStepTransitionVideo={
                  handleTransitionVideoDismiss
                }
              />
              <ContentCardStrip
                cards={selectedStep.content_cards}
                brandSlug={brandSlug}
                currentChapterKey={
                  chapters[currentChapterIdx]?.chapter_key ?? null
                }
              />
            </>
          ) : (
            (() => {
              // PR 44: empty chapter (no active steps) renders the
              // YoureCurrentScreen — celebrates the previous chapter,
              // surfaces any recent booking, and frames this chapter as
              // "coming soon" so the holding state reads intentional.
              const previousChapterIdx = selectedChapterIdx - 1;
              const previousChapter =
                previousChapterIdx >= 0 ? chapters[previousChapterIdx] : null;
              // Most-recent confirmed booking across all steps. The shell
              // doesn't know which step belongs to which chapter without
              // looking it up, so we just surface the latest booking
              // overall — for the Chapter 2 → 3 jump there's exactly one.
              const allBookings = Object.values(bookingsByStepId)
                .filter((b) => b.status === "confirmed")
                .sort(
                  (a, b) =>
                    Date.parse(b.start_time) - Date.parse(a.start_time),
                );
              const recent = allBookings[0] ?? null;
              const tz = "America/New_York"; // matches the schedule defaults
              return (
                <YoureCurrentScreen
                  currentChapter={selectedChapter}
                  currentChapterNumber={selectedChapterIdx + 1}
                  previousChapter={previousChapter ?? null}
                  previousChapterNumber={
                    previousChapter ? previousChapterIdx + 1 : null
                  }
                  booking={recent}
                  bookingDayLabel={
                    recent ? formatDayLabel(recent.start_time, tz) : null
                  }
                  bookingTimeLabel={
                    recent ? formatTimeLabel(recent.start_time, tz) : null
                  }
                  advisorName={advisorName ?? null}
                />
              );
            })()
          )}
        </div>
      </section>

      {activeTransitionVideo && (
        <StepTransitionVideoPopup
          key={`video-${activeTransitionVideo.stepId}`}
          config={activeTransitionVideo}
          onDismiss={handleTransitionVideoDismiss}
          onDismissed={handleTransitionVideoDismissed}
        />
      )}

      {activeTransition && (
        <StepTransitionPopup
          // Re-key per step so the auto-dismiss timer always restarts when
          // a different step's transition fires back-to-back (rare, but
          // possible if the candidate clicks through quickly).
          key={activeTransition.stepId}
          config={activeTransition}
          onDismiss={handleTransitionDismiss}
          onDismissed={() => setActiveTransition(null)}
        />
      )}
    </div>
    <ScrollDownHint />
    <BackToTop />
    </>
  );
}

function StepRenderer({
  step,
  stepsInChapter,
  chapterNumber,
  currentChapterKey,
  onTourComplete,
  onStepAdvance,
  onLogEvent,
  onEducationCompleted,
  tourPending,
  candidate,
  leaderName,
  brandName,
  initialApplicationAnswers,
  isApplicationSubmitted,
  prefilledZip,
  prefilledPhone,
  brandSlug,
  onSaveApplicationAnswer,
  onSubmitApplication,
  onContinueAfterApplication,
  bookingsByStepId,
  hasAssignedRep,
  advisorName,
  brandShortName,
  isGCalConfigured,
  onGetSlots,
  onBookSlot,
  onCancelBooking,
  onSubmitBookingUnavailable,
  stepTransitionVideo,
  onDismissStepTransitionVideo,
}: {
  step: Step;
  stepsInChapter: Step[];
  chapterNumber: number;
  /** Used by the slides step (PR 43) to highlight the candidate's
   *  current stage on the journey timeline rendered below the deck. */
  currentChapterKey: string | null;
  onTourComplete: () => void;
  onStepAdvance: () => void;
  onLogEvent: (args: ClientLogEventArgs) => Promise<void>;
  /** PR 60: invoked when the candidate views the last slide of the
   *  explore/tour deck. Owner of the per-mount dedup lives in the
   *  parent CinematicShell — this prop is fire-and-forget. */
  onEducationCompleted: () => void;
  tourPending: boolean;
  candidate: ApplicationCandidate;
  leaderName: string;
  brandName: string;
  initialApplicationAnswers: Record<string, unknown>;
  isApplicationSubmitted: boolean;
  prefilledZip: string | null;
  prefilledPhone: string | null;
  brandSlug: string;
  onSaveApplicationAnswer: (
    fieldKey: string,
    fieldValue: unknown,
  ) => Promise<void>;
  onSubmitApplication: (finalAnswers: Record<string, unknown>) => Promise<void>;
  onContinueAfterApplication: () => void;
  bookingsByStepId: Record<string, ExistingBooking>;
  hasAssignedRep: boolean;
  advisorName: string | null;
  brandShortName: string;
  isGCalConfigured: boolean;
  onGetSlots: (stepId: string) => Promise<{
    configured: boolean;
    slots: Slot[];
    error?: string;
  }>;
  onBookSlot: (
    stepId: string,
    slotIso: string,
  ) => Promise<{
    id: string;
    start_time: string;
    end_time: string;
    meeting_url: string | null;
  }>;
  onCancelBooking: (bookingId: string) => Promise<void>;
  onSubmitBookingUnavailable: (
    email: string,
    availableTimes: string,
    notes: string,
  ) => Promise<{ success: boolean; error?: string }>;
  stepTransitionVideo: StepTransitionVideoConfig | null;
  onDismissStepTransitionVideo: (
    stepId: string,
  ) => Promise<{ success: boolean }>;
}) {
  if (step.content_type === "slides") {
    const raw = step.config?.slides;
    const slides = (Array.isArray(raw) ? raw : []) as Slide[];
    // PR 39: pass next-step context so the slides renderer can show a
    // handoff card after the last image slide that previews where the
    // candidate is heading.
    const nextStep = stepsInChapter[step.position + 1] ?? null;
    return (
      <>
        <SlidesRenderer
          slides={slides}
          onComplete={onTourComplete}
          disabled={tourPending}
          nextStepLabel={nextStep?.label ?? null}
          nextStepIsApplication={nextStep?.content_type === "application"}
          candidate={candidate}
          stepTransitionVideo={stepTransitionVideo}
          onDismissStepTransitionVideo={onDismissStepTransitionVideo}
          onSlideViewed={(slideId, slideIndex) => {
            void onLogEvent({
              category: "engagement",
              eventType: "slide_viewed",
              eventKey: slideId,
              metadata: {
                slide_index: slideIndex,
                chapter_key: step.chapter_key,
                step_id: step.id,
              },
            });
            // brand_tour_engaged = first time the candidate advances
            // past slide 1 of the brand tour. portal_first_visit can
            // fire for a 5-second click-and-close; reaching slide 2
            // (index 1) means they're actually moving through the
            // deck. Once-per-candidate idempotency is enforced server-
            // side in logEvent, so revisiting slide 2 after going back
            // doesn't refire.
            if (
              slideIndex === 1 &&
              step.chapter_key === "explore" &&
              step.step_key === "tour"
            ) {
              void onLogEvent({
                category: "milestone",
                eventType: "brand_tour_engaged",
              });
            }
            // PR 60: education_completed = "watched the whole brand
            // pitch". Fires on the last slide of explore/tour
            // specifically, independent of whether the candidate
            // continues into the application step. The gap between
            // this event and application_started is the sales-team
            // signal for stalled-after-education leads.
            if (
              slideIndex === slides.length - 1 &&
              step.chapter_key === "explore" &&
              step.step_key === "tour"
            ) {
              onEducationCompleted();
            }
          }}
        />
      </>
    );
  }
  if (step.content_type === "application") {
    return (
      <ApplicationRenderer
        candidate={candidate}
        leaderName={leaderName}
        brandSlug={brandSlug}
        prefilledZip={prefilledZip}
        prefilledPhone={prefilledPhone}
        initialAnswers={initialApplicationAnswers}
        isAlreadySubmitted={isApplicationSubmitted}
        onSaveAnswer={onSaveApplicationAnswer}
        onSubmit={onSubmitApplication}
        onContinueToNextChapter={onContinueAfterApplication}
      />
    );
  }
  if (step.content_type === "static") {
    const body = typeof step.config?.body === "string" ? step.config.body : "";
    return <StaticStep step={step} chapterNumber={chapterNumber} body={body} />;
  }
  if (step.content_type === "video") {
    return (
      <VideoRenderer
        config={step.config as unknown as VideoConfig}
        onComplete={onStepAdvance}
      />
    );
  }
  if (step.content_type === "schedule") {
    return (
      <ScheduleRenderer
        stepId={step.id}
        config={step.config as unknown as ScheduleConfig}
        existingBooking={bookingsByStepId[step.id] ?? null}
        brandName={brandName}
        brandShortName={brandShortName}
        advisorName={advisorName}
        isGCalConfigured={isGCalConfigured}
        hasAssignedRep={hasAssignedRep}
        candidateEmail={candidate.email}
        onGetSlots={onGetSlots}
        onBook={onBookSlot}
        onCancel={onCancelBooking}
        onSubmitUnavailable={onSubmitBookingUnavailable}
        onComplete={onStepAdvance}
      />
    );
  }
  return <PlaceholderStep step={step} chapterNumber={chapterNumber} />;
}

function StaticStep({
  step,
  chapterNumber,
  body,
}: {
  step: Step;
  chapterNumber: number;
  body: string;
}) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      <header className="cine-step-content-header">
        <div className="cine-step-content-eyebrow">
          Chapter {chapterNumber} · Step {step.position + 1}
        </div>
        <h1 className="cine-step-content-title">{step.label}</h1>
        <p className="cine-step-content-desc">{step.description}</p>
      </header>
      {paragraphs.length > 0 ? (
        <div className="cine-step-body-copy">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <div className="cine-placeholder">
          <div className="cine-placeholder-icon">✍️</div>
          <h4>Copy not written yet</h4>
          <p>
            This step is a <strong>static</strong> content block. Seed or edit
            its body via <code>steps_config.config.body</code>.
          </p>
        </div>
      )}
    </>
  );
}

function PlaceholderStep({
  step,
  chapterNumber,
}: {
  step: Step;
  chapterNumber: number;
}) {
  return (
    <>
      <header className="cine-step-content-header">
        <div className="cine-step-content-eyebrow">
          Chapter {chapterNumber} · Step {step.position + 1}
        </div>
        <h1 className="cine-step-content-title">{step.label}</h1>
        <p className="cine-step-content-desc">{step.description}</p>
      </header>
      <div className="cine-placeholder">
        <div className="cine-placeholder-icon">🧱</div>
        <h4>Coming in a later PR</h4>
        <p>
          This step uses the <code>{step.content_type}</code> content type,
          which isn&apos;t wired up yet.
        </p>
        <span className="cine-placeholder-type">
          Type · {step.content_type}
        </span>
      </div>
    </>
  );
}

function CheckIcon({ small = false }: { small?: boolean }) {
  const size = small ? 11 : 13;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <path d="M3 8l3.5 3.5L13 5" />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg width={8} height={8} viewBox="0 0 16 16" fill="currentColor">
      <circle cx={8} cy={8} r={5} />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    >
      <rect x={3} y={7} width={10} height={7} rx={1.5} />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
