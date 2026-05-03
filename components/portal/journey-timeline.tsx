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

// Pin positions along the SVG road. Coordinates are in the SVG's
// viewBox space (1200×600). Tuned to land each pin on a visible
// segment of the road path.
const PIN_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 95, y: 530 },
  { x: 280, y: 470 },
  { x: 410, y: 405 },
  { x: 580, y: 360 },
  { x: 720, y: 305 },
  { x: 850, y: 250 },
  { x: 980, y: 180 },
  { x: 1110, y: 100 },
];

// Smooth bezier through the pin positions, traced as a single path.
// Built by hand to give a believable winding-road feel without needing
// an actual photograph in /public.
const ROAD_PATH =
  "M 95 530 " +
  "C 200 530, 250 480, 280 470 " +
  "C 320 460, 380 420, 410 405 " +
  "C 470 380, 540 360, 580 360 " +
  "C 640 360, 690 320, 720 305 " +
  "C 770 280, 820 260, 850 250 " +
  "C 900 230, 950 200, 980 180 " +
  "C 1030 150, 1080 120, 1110 100";

interface BrandTheme {
  /** Decoration emoji rendered above each pin's "You are here" marker
   *  to brand the current-stage callout. */
  decor: string;
  /** Aria description used by screen readers for the road. */
  pathDescription: string;
}

const BRAND_THEMES: Record<string, BrandTheme> = {
  "hounds-town-usa": {
    decor: "🐾",
    pathDescription: "Trail of paw prints connecting each stage.",
  },
  "cruisin-tikis": {
    decor: "⛵",
    pathDescription: "Boat wake connecting each stage.",
  },
};

const FALLBACK_THEME: BrandTheme = {
  decor: "★",
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
 * deck. PR 44: redesigned as a single cohesive image — winding SVG road
 * with numbered pins at fixed positions along the curve, brand-tinted
 * background, and a "You are here" tag pointing at the current stage.
 *
 * No external image asset needed; the road is pure SVG. Brand decoration
 * is applied via a single emoji on the "You are here" tag and a
 * brand-color tint on the road itself.
 */
export function JourneyTimeline({ brandSlug, currentChapterKey }: Props) {
  const theme = BRAND_THEMES[brandSlug] ?? FALLBACK_THEME;

  const currentStageNum = (() => {
    const direct = STAGES.find((s) => s.chapterKey === currentChapterKey);
    if (direct) return direct.num;
    return 1; // default — fresh candidate is on stage 1
  })();

  // Tap-to-show tooltip state (separate from CSS :hover for desktop).
  // Mobile users tap a pin → tooltip shows; tap elsewhere or another
  // pin → close. Auto-dismiss after 5s.
  const [openPin, setOpenPin] = useState<number | null>(null);
  useEffect(() => {
    if (openPin === null) return;
    const t = window.setTimeout(() => setOpenPin(null), 5000);
    return () => window.clearTimeout(t);
  }, [openPin]);
  useEffect(() => {
    if (openPin === null) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(".journey-pin")) return;
      setOpenPin(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openPin]);

  // Reveal-on-scroll for the road + pins.
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
      className={`journey-roadmap${revealed ? " is-revealed" : ""}`}
      aria-label="Your journey ahead"
      data-brand-slug={brandSlug}
    >
      <header className="journey-roadmap-header">
        <h2 className="journey-roadmap-title">Your journey ahead</h2>
        <p className="journey-roadmap-sub">
          Here&apos;s how the next 6–8 weeks look.
        </p>
      </header>

      <div className="journey-roadmap-canvas" role="img" aria-label="Discovery journey road map">
        <svg
          viewBox="0 0 1200 600"
          className="journey-roadmap-svg"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {/* Sky → ground gradient backdrop. Brand color tints the
              ground-half so each brand's road has its own warmth. */}
          <defs>
            <linearGradient id="journey-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4f6f8" />
              <stop
                offset="100%"
                stopColor="color-mix(in srgb, var(--brand-soft, #eef2ff) 60%, #ffffff)"
              />
            </linearGradient>
            <linearGradient id="journey-road-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="1200" height="600" fill="url(#journey-bg)" />

          {/* Road shadow (slightly offset, darker, wider) for depth. */}
          <path
            d={ROAD_PATH}
            stroke="rgba(0,0,0,0.10)"
            strokeWidth="34"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            transform="translate(0, 6)"
          />

          {/* Road body — neutral asphalt grey with a brand-tinted overlay. */}
          <path
            d={ROAD_PATH}
            stroke="#3f4651"
            strokeWidth="28"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Centerline dashes — the candidate's progress paints them
              in brand color from start through the current pin. */}
          <path
            d={ROAD_PATH}
            stroke="#fafafa"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="14 18"
            fill="none"
            opacity="0.7"
          />
        </svg>

        {/* Pins overlaid in absolute coords, scaled with the SVG via the
            same viewBox-aspect-ratio container. */}
        <div className="journey-roadmap-pins" role="list">
          {STAGES.map((stage, i) => {
            const pos = PIN_POSITIONS[i];
            const isCurrent = stage.num === currentStageNum;
            const isPast = stage.num < currentStageNum;
            const cls = [
              "journey-pin",
              isCurrent && "is-current",
              isPast && "is-past",
              !isCurrent && !isPast && "is-future",
              openPin === stage.num && "is-open",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                type="button"
                key={stage.num}
                className={cls}
                role="listitem"
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Stage ${stage.num} — ${stage.title}, ${stage.weeks}`}
                style={{
                  left: `${(pos.x / 1200) * 100}%`,
                  top: `${(pos.y / 600) * 100}%`,
                }}
                onClick={() =>
                  setOpenPin((cur) => (cur === stage.num ? null : stage.num))
                }
              >
                {isCurrent && (
                  <span
                    className="journey-pin-here"
                    aria-hidden="true"
                  >
                    <span className="journey-pin-here-decor">{theme.decor}</span>
                    <span className="journey-pin-here-text">You are here</span>
                    <span className="journey-pin-here-tip" />
                  </span>
                )}
                <span className="journey-pin-circle">
                  {isPast ? (
                    <span aria-hidden="true">✓</span>
                  ) : (
                    <span>{stage.num}</span>
                  )}
                </span>
                <div className="journey-pin-tooltip" role="tooltip">
                  <div className="journey-pin-tooltip-weeks">{stage.weeks}</div>
                  <div className="journey-pin-tooltip-title">{stage.title}</div>
                  <p className="journey-pin-tooltip-body">{stage.body}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only">{theme.pathDescription}</p>
    </section>
  );
}
