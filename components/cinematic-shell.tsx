"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
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
import type { ScheduleConfig, Slot } from "@/lib/schedule-shared";
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
  onTourComplete: (nextStepIdx: number) => Promise<void>;
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
  // Application runtime inputs
  candidate: ApplicationCandidate;
  initialApplicationAnswers: Record<string, unknown>;
  isApplicationSubmitted: boolean;
  /** ZIP prefilled at candidate creation time (PR 37). When set, the
   *  application's location step skips the cold ZIP input and lands on
   *  the confirmation card. */
  prefilledZip: string | null;
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
   * Steps completed within the candidate's CURRENT chapter — derived from
   * server-side current_step (clamped). Drives the chapter progress bar in
   * the sidebar.
   */
  currentChapterCompletedSteps: number;
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
  candidate,
  initialApplicationAnswers,
  isApplicationSubmitted,
  prefilledZip,
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
  currentChapterCompletedSteps,
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
  const [activeTransition, setActiveTransition] =
    useState<StepTransitionPopupConfig | null>(null);
  const isFirstStepRender = useRef(true);
  // Track which step we last landed on, so navigating back to the same step
  // (within a chapter) doesn't refire. Seeded with the initial step id so
  // a fresh page load never fires.
  const lastStepIdRef = useRef<string | null>(selectedStep?.id ?? null);

  useEffect(() => {
    if (!selectedStep) return;
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      lastStepIdRef.current = selectedStep.id;
      return;
    }
    if (lastStepIdRef.current === selectedStep.id) return;
    lastStepIdRef.current = selectedStep.id;

    const config = transitionsByStepId[selectedStep.id];
    if (!config) return;
    if (dismissedStepIds.has(selectedStep.id)) return;
    setActiveTransition(config);
  }, [selectedStep, transitionsByStepId, dismissedStepIds]);

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
    startTransition(async () => {
      await onTourComplete(nextIdx);
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

            const cls = [
              "cine-chapter",
              isDone && "done",
              isCurrent && "current",
              isLocked && "locked",
              isActive && "active",
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
                  ) : isCurrent ? (
                    <DotIcon />
                  ) : (
                    <LockIcon />
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
                onTourComplete={handleTourComplete}
                onStepAdvance={handleStepAdvance}
                tourPending={pending}
                candidate={candidate}
                leaderName={leader.name}
                brandName={brandName}
                initialApplicationAnswers={initialApplicationAnswers}
                isApplicationSubmitted={isApplicationSubmitted}
                prefilledZip={prefilledZip}
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
              />
              <ContentCardStrip cards={selectedStep.content_cards} />
            </>
          ) : (
            <p>No steps configured for this chapter yet.</p>
          )}
        </div>
      </section>

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
  );
}

function StepRenderer({
  step,
  stepsInChapter,
  chapterNumber,
  onTourComplete,
  onStepAdvance,
  tourPending,
  candidate,
  leaderName,
  brandName,
  initialApplicationAnswers,
  isApplicationSubmitted,
  prefilledZip,
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
}: {
  step: Step;
  stepsInChapter: Step[];
  chapterNumber: number;
  onTourComplete: () => void;
  onStepAdvance: () => void;
  tourPending: boolean;
  candidate: ApplicationCandidate;
  leaderName: string;
  brandName: string;
  initialApplicationAnswers: Record<string, unknown>;
  isApplicationSubmitted: boolean;
  prefilledZip: string | null;
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
}) {
  if (step.content_type === "slides") {
    const raw = step.config?.slides;
    const slides = (Array.isArray(raw) ? raw : []) as Slide[];
    return (
      <SlidesRenderer
        slides={slides}
        onComplete={onTourComplete}
        disabled={tourPending}
      />
    );
  }
  if (step.content_type === "application") {
    return (
      <ApplicationRenderer
        candidate={candidate}
        leaderName={leaderName}
        brandSlug={brandSlug}
        prefilledZip={prefilledZip}
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
        onGetSlots={onGetSlots}
        onBook={onBookSlot}
        onCancel={onCancelBooking}
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
