"use client";

import { useEffect, useRef, useState } from "react";

interface Stage {
  /** Display number (1-indexed). */
  num: number;
  weeks: string;
  title: string;
  body: string;
  /** chapter_key from chapters_config that maps to "currently on this
   *  stage" — null means the stage is editorial-only and never marked
   *  current (e.g. the Visionary Call between chapter milestones). */
  chapterKey: string | null;
}

const STAGES: Stage[] = [
  {
    num: 1,
    weeks: "Week 1",
    title: "Questionnaire",
    body: "Five minutes. Confirms market availability and financial fit.",
    chapterKey: "explore",
  },
  {
    num: 2,
    weeks: "Week 1",
    title: "Discovery Call",
    body: "Two-way conversation. Your goals, our opportunity. Clear expectations set.",
    chapterKey: "first_chat",
  },
  {
    num: 3,
    weeks: "Weeks 1–2",
    title: "Investment & Unit Economics",
    body: "Full financial breakdown. FDD sent. Budget tool provided. Numbers on the table.",
    chapterKey: "deep_dive",
  },
  {
    num: 4,
    weeks: "Weeks 2–3",
    title: "FDD Exploration",
    body: "Walk through key FDD items. Financial verification. Territory discussion.",
    chapterKey: "playbook",
  },
  {
    num: 5,
    weeks: "Weeks 3–4",
    title: "Due Diligence",
    body: "Territory confirmed. Validation calls with current franchisees.",
    chapterKey: "verify",
  },
  {
    num: 6,
    weeks: "Weeks 4–5",
    title: "Visionary Call",
    body: "Direct conversation with Co-CEOs. Vision and future explored.",
    chapterKey: null,
  },
  {
    num: 7,
    weeks: "Weeks 5–6",
    title: "Confirmation Day",
    body: "Meet the full support team. Final mutual alignment.",
    chapterKey: "visit",
  },
  {
    num: 8,
    weeks: "Weeks 6–8",
    title: "Signing Day & Award",
    body: "Agreement executed. Onboarding begins. Your territory is secured.",
    chapterKey: "award",
  },
];

interface BrandTheme {
  /** Decoration emoji shown in each stage card's corner. */
  decor: string;
  /** Path connector accent shown along the SVG trail at fixed positions. */
  trailAccent: string;
  /** Aria description used by screen readers for the connector path. */
  pathDescription: string;
}

const BRAND_THEMES: Record<string, BrandTheme> = {
  "hounds-town-usa": {
    decor: "🐾",
    trailAccent: "🐾",
    pathDescription: "Trail of paw prints connecting each stage.",
  },
  "cruisin-tikis": {
    decor: "🌊",
    trailAccent: "⛵",
    pathDescription: "Boat wake connecting each stage.",
  },
};

const FALLBACK_THEME: BrandTheme = {
  decor: "✦",
  trailAccent: "·",
  pathDescription: "Connecting path between stages.",
};

interface Props {
  brandSlug: string;
  /** chapter_key the candidate is currently on — used to mark the
   *  matching stage as active. Past stages render muted; future stages
   *  render lighter. */
  currentChapterKey: string | null;
}

/**
 * 8-stage discovery roadmap shown on Chapter 1 Step 1 (slides) below the
 * deck. The same set of stages on every brand; only the decoration and
 * connector accent change per brand. Ordering matches the editorial
 * "6-8 weeks" framing the team uses with candidates, which is more
 * granular than the 7 portal chapters — that's why stage 6 (Visionary
 * Call) has no chapter mapping.
 *
 * Layout is a serpentine zigzag on desktop (rows of 4, alternating
 * direction) and a vertical stack on mobile.
 */
export function JourneyTimeline({ brandSlug, currentChapterKey }: Props) {
  const theme = BRAND_THEMES[brandSlug] ?? FALLBACK_THEME;

  // Resolve which stage is "current" by chapter mapping. Past stages are
  // every stage with num < currentStageNum. If the candidate's chapter
  // doesn't map (e.g. an editorial-only chapter), fall back to the
  // previous mapped stage so the visualization still highlights forward
  // progress.
  const currentStageNum = (() => {
    const direct = STAGES.find((s) => s.chapterKey === currentChapterKey);
    if (direct) return direct.num;
    return 1; // default — fresh candidate is on stage 1
  })();

  // Animate the trail in once on first scroll into view. IntersectionObserver
  // so the entrance lands when the candidate scrolls past the slides
  // and discovers the timeline below.
  const containerRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || revealed) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed]);

  return (
    <section
      ref={containerRef}
      className={`journey-timeline${revealed ? " is-revealed" : ""}`}
      aria-label="Your journey ahead"
      data-brand-slug={brandSlug}
    >
      <header className="journey-timeline-header">
        <h2 className="journey-timeline-title">Your journey ahead</h2>
        <p className="journey-timeline-sub">
          Here&apos;s how the next 6–8 weeks look.
        </p>
      </header>

      <ol className="journey-timeline-track" role="list">
        {STAGES.map((stage) => {
          const isCurrent = stage.num === currentStageNum;
          const isPast = stage.num < currentStageNum;
          const cls = [
            "journey-stage",
            isCurrent && "is-current",
            isPast && "is-past",
            !isCurrent && !isPast && "is-future",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={stage.num}
              className={cls}
              role="listitem"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="journey-stage-marker" aria-hidden="true">
                <span className="journey-stage-num">{stage.num}</span>
                <span className="journey-stage-decor">{theme.decor}</span>
              </div>
              <div className="journey-stage-card">
                <div className="journey-stage-weeks">{stage.weeks}</div>
                <h3 className="journey-stage-heading">{stage.title}</h3>
                <p className="journey-stage-body">{stage.body}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="sr-only">{theme.pathDescription}</p>
    </section>
  );
}
