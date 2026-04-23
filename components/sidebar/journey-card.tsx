// Context-aware "journey" card rendered in the sidebar above the advisor.
// State is computed server-side (see resolveJourneyCardState in the page)
// and passed as a prop; this component just renders the chosen variant.

export type JourneyVariant =
  | "almost_there"
  | "stalled"
  | "between_chapters"
  | "on_a_roll"
  | "welcome_in";

export interface JourneyCardState {
  variant: JourneyVariant;
  heading: string;
  body: string;
  icon: string; // emoji
  tone: "brand" | "soft" | "muted" | "success";
}

const TONE_CLASS: Record<JourneyCardState["tone"], string> = {
  brand: "cine-sidebar-journey-tone-brand",
  soft: "cine-sidebar-journey-tone-soft",
  muted: "cine-sidebar-journey-tone-muted",
  success: "cine-sidebar-journey-tone-success",
};

export function JourneyCard({ state }: { state: JourneyCardState }) {
  return (
    <div className={`cine-sidebar-journey ${TONE_CLASS[state.tone]}`}>
      <div className="cine-sidebar-journey-header">
        <span className="cine-sidebar-journey-icon" aria-hidden="true">
          {state.icon}
        </span>
        <div className="cine-sidebar-journey-heading">{state.heading}</div>
      </div>
      <p className="cine-sidebar-journey-body">{state.body}</p>
    </div>
  );
}

// Chapter shape only needs what the resolver uses.
export interface JourneyChapter {
  chapter_key: string;
  label: string;
  name: string;
}

export interface ResolveInput {
  currentChapterIdx: number;
  chapters: JourneyChapter[];
  lastActivityAt: Date | null;
  recentlyActive: boolean; // any candidate_progress row within last ~48h
  currentChapterStepsCompleted: number;
  currentChapterStepCount: number;
}

function daysSince(d: Date): number {
  const ms = Date.now() - d.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

export function resolveJourneyCardState(input: ResolveInput): JourneyCardState {
  const {
    currentChapterIdx,
    chapters,
    lastActivityAt,
    recentlyActive,
    currentChapterStepsCompleted,
    currentChapterStepCount,
  } = input;
  const total = chapters.length;
  const isFinalChapter = currentChapterIdx >= total - 1;

  // a) Almost there — Chapter 6 or 7 (index >= 5)
  if (currentChapterIdx >= 5) {
    const left = Math.max(0, total - currentChapterIdx - 1);
    const tail =
      left === 0
        ? "You're at your signing day"
        : `${left} chapter${left === 1 ? "" : "s"} left · Your signing day is close`;
    return {
      variant: "almost_there",
      heading: "Almost there",
      body: tail,
      icon: "🎯",
      tone: "brand",
    };
  }

  // b) Stalled — 3+ days since last activity and not at final chapter
  if (
    lastActivityAt &&
    daysSince(lastActivityAt) >= 3 &&
    !isFinalChapter
  ) {
    return {
      variant: "stalled",
      heading: "Ready when you are",
      body: "It's been a few days. Pick up where you left off whenever you're ready.",
      icon: "💭",
      tone: "muted",
    };
  }

  // c) Between chapters — every step in the current chapter is complete but
  // current_chapter hasn't advanced yet (rare because submits auto-advance).
  if (
    currentChapterStepCount > 0 &&
    currentChapterStepsCompleted >= currentChapterStepCount &&
    !isFinalChapter
  ) {
    const currentLabel = chapters[currentChapterIdx]?.label ?? "this chapter";
    const nextLabel = chapters[currentChapterIdx + 1]?.label ?? "what's next";
    return {
      variant: "between_chapters",
      heading: "Nicely done",
      body: `You wrapped up ${currentLabel}. Up next: ${nextLabel}.`,
      icon: "✓",
      tone: "success",
    };
  }

  // d) On a roll — mid-journey (chapters 2-5 = index 1-4) with recent activity
  if (currentChapterIdx >= 1 && currentChapterIdx <= 4 && recentlyActive) {
    const done = currentChapterIdx;
    const weeksLeft = Math.max(2, total - currentChapterIdx);
    return {
      variant: "on_a_roll",
      heading: "You're on a roll",
      body: `${done} of ${total} chapters done · ~${weeksLeft} weeks to go`,
      icon: "✨",
      tone: "brand",
    };
  }

  // e) Welcome — default (fresh candidate on Chapter 1, or any quiet state
  // that didn't match above).
  return {
    variant: "welcome_in",
    heading: "Welcome in",
    body: "Here's what to expect: 7 chapters, ~7 weeks, no surprises. Your advisor is always a message away.",
    icon: "👋",
    tone: "soft",
  };
}
