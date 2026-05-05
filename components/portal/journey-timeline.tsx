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

// PR 45: redesigned road with multiple switchbacks. Path coordinates are
// in the SVG's viewBox space (1200×600). Tuned by eye so each pin sits
// at an inflection point along the curve.
const ROAD_PATH =
  "M 60 540 " +
  "C 140 540, 200 500, 220 470 " +
  "C 245 430, 300 420, 330 440 " + // first switchback dip
  "C 370 470, 420 440, 440 400 " +
  "C 470 350, 540 380, 560 350 " + // climb
  "C 600 300, 660 320, 700 290 " +
  "C 750 250, 800 280, 830 250 " + // second switchback
  "C 880 200, 940 220, 970 180 " +
  "C 1010 130, 1080 150, 1100 100";

const PIN_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 70, y: 540 },
  { x: 220, y: 470 },
  { x: 350, y: 432 },
  { x: 470, y: 380 },
  { x: 605, y: 320 },
  { x: 740, y: 270 },
  { x: 880, y: 220 },
  { x: 1100, y: 100 },
];

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
   *  matching stage as active. */
  currentChapterKey: string | null;
  /** Optional override for the section heading. Falls back to "Your
   *  journey ahead" when omitted. */
  title?: string;
}

/**
 * 8-stage discovery roadmap shown on Chapter 1 Step 1 (slides) below the
 * deck. PR 45: scenery, road texture, brand decorations.
 *
 * The whole composition is inline SVG — no external image asset. Layered
 * back-to-front:
 *   1. Sky gradient + sun + clouds
 *   2. Distant + mid mountains (silhouettes)
 *   3. Foreground (grass for HT, sand+water for CT)
 *   4. Brand-specific scenery (dog house / boat / palms)
 *   5. Road shadow → asphalt body → yellow centerline
 *   6. Path-side brand sprinkles (paws / wave dashes)
 *   7. Numbered pins overlaid as HTML buttons (kept outside the SVG so
 *      tooltips can use absolute positioning + flex)
 */
export function JourneyTimeline({
  brandSlug,
  currentChapterKey,
  title,
}: Props) {
  const theme = BRAND_THEMES[brandSlug] ?? FALLBACK_THEME;
  const isHT = brandSlug === "hounds-town-usa";
  const isCT = brandSlug === "cruisin-tikis";

  const currentStageNum = (() => {
    const direct = STAGES.find((s) => s.chapterKey === currentChapterKey);
    if (direct) return direct.num;
    return 1;
  })();

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
        <h2 className="journey-roadmap-title">
          {title?.trim() || "Your journey ahead"}
        </h2>
        <p className="journey-roadmap-sub">
          Here&apos;s how the next 6–8 weeks look.{" "}
          <span className="journey-roadmap-tap">
            Tap a stop to see what happens there.
          </span>
        </p>
      </header>

      <div
        className="journey-roadmap-canvas"
        role="img"
        aria-label="Discovery journey road map"
      >
        <svg
          viewBox="0 0 1200 600"
          className="journey-roadmap-svg"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            {/* Per-brand sky gradient. HT runs cool blue → warm cream;
                CT runs teal → coral so each road feels like it lives in
                its own atmosphere. */}
            <linearGradient id="jr-sky" x1="0" y1="0" x2="0" y2="1">
              {isCT ? (
                <>
                  <stop offset="0%" stopColor="#9be0e8" />
                  <stop offset="60%" stopColor="#fce4d3" />
                  <stop offset="100%" stopColor="#f8c8a4" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#cfe7f3" />
                  <stop offset="65%" stopColor="#fff3dc" />
                  <stop offset="100%" stopColor="#fde6c8" />
                </>
              )}
            </linearGradient>
            <radialGradient id="jr-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff7d6" stopOpacity="1" />
              <stop offset="60%" stopColor="#ffd97a" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ffd97a" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="jr-mountains-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(80, 110, 130, 0.55)" />
              <stop offset="100%" stopColor="rgba(80, 110, 130, 0.25)" />
            </linearGradient>
            <linearGradient id="jr-mountains-mid" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={
                  isCT
                    ? "rgba(33, 57, 118, 0.45)"
                    : "rgba(0, 138, 186, 0.45)"
                }
              />
              <stop
                offset="100%"
                stopColor={
                  isCT
                    ? "rgba(33, 57, 118, 0.18)"
                    : "rgba(0, 138, 186, 0.18)"
                }
              />
            </linearGradient>
            <linearGradient id="jr-ground" x1="0" y1="0" x2="0" y2="1">
              {isCT ? (
                <>
                  <stop offset="0%" stopColor="#f5e7c8" />
                  <stop offset="100%" stopColor="#ecd6a8" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#bdd99c" />
                  <stop offset="100%" stopColor="#9ec47a" />
                </>
              )}
            </linearGradient>
          </defs>

          {/* 1. Sky */}
          <rect x="0" y="0" width="1200" height="600" fill="url(#jr-sky)" />

          {/* 2. Sun */}
          <g className="jr-sun">
            <circle cx="900" cy="120" r="80" fill="url(#jr-sun)" />
            <circle cx="900" cy="120" r="34" fill="#fff7d6" />
          </g>

          {/* 3. Clouds — slow drift via CSS animation */}
          <g className="jr-cloud" transform="translate(150, 90)">
            <ellipse cx="40" cy="20" rx="50" ry="14" fill="rgba(255,255,255,0.92)" />
            <ellipse cx="80" cy="14" rx="36" ry="12" fill="rgba(255,255,255,0.95)" />
            <ellipse cx="20" cy="14" rx="28" ry="10" fill="rgba(255,255,255,0.9)" />
          </g>
          <g className="jr-cloud jr-cloud-slow" transform="translate(450, 60)">
            <ellipse cx="30" cy="14" rx="38" ry="11" fill="rgba(255,255,255,0.9)" />
            <ellipse cx="60" cy="10" rx="26" ry="9" fill="rgba(255,255,255,0.92)" />
          </g>
          <g className="jr-cloud jr-cloud-fast" transform="translate(680, 130)">
            <ellipse cx="32" cy="14" rx="32" ry="10" fill="rgba(255,255,255,0.85)" />
            <ellipse cx="58" cy="10" rx="22" ry="8" fill="rgba(255,255,255,0.88)" />
          </g>

          {/* 4. Far mountains (low silhouette) */}
          <path
            d="M 0 380 L 80 320 L 160 360 L 240 290 L 340 340 L 440 280 L 540 320 L 640 270 L 760 310 L 880 260 L 1000 300 L 1120 250 L 1200 290 L 1200 600 L 0 600 Z"
            fill="url(#jr-mountains-far)"
            opacity="0.7"
          />

          {/* 5. Mid mountains (brand-tinted, in front of far) */}
          <path
            d="M 0 440 L 100 380 L 200 420 L 320 360 L 440 410 L 580 350 L 700 400 L 820 350 L 940 390 L 1080 340 L 1200 380 L 1200 600 L 0 600 Z"
            fill="url(#jr-mountains-mid)"
          />

          {/* 6. Ground / grass / sand */}
          <rect x="0" y="500" width="1200" height="100" fill="url(#jr-ground)" />

          {/* 7. Brand foreground decorations — sit between ground and road */}
          {isHT && (
            <>
              {/* Dog house in the distance */}
              <g
                className="jr-decor jr-decor-doghouse"
                transform="translate(380, 470)"
              >
                <polygon points="0,12 18,0 36,12 36,30 0,30" fill="#a25c2e" />
                <polygon points="-3,12 18,-3 39,12" fill="#7b3f1c" />
                <rect x="14" y="16" width="8" height="14" rx="3" fill="#3b2515" />
              </g>
              {/* Tiny dog silhouette near the start, looking up the road */}
              <g
                className="jr-decor jr-decor-dog"
                transform="translate(28, 528)"
              >
                <ellipse cx="14" cy="12" rx="14" ry="6" fill="#4a3024" />
                <circle cx="26" cy="6" r="6" fill="#4a3024" />
                <rect x="6" y="13" width="3" height="7" fill="#4a3024" />
                <rect x="20" y="13" width="3" height="7" fill="#4a3024" />
                <path d="M 28 4 L 32 -1 L 30 6 Z" fill="#4a3024" />
              </g>
              {/* Fire hydrant beside the road, mid-journey */}
              <g
                className="jr-decor jr-decor-hydrant"
                transform="translate(540, 470)"
              >
                <rect x="0" y="6" width="12" height="22" fill="#cf3e2a" rx="2" />
                <rect x="-3" y="2" width="18" height="6" fill="#cf3e2a" rx="2" />
                <circle cx="6" cy="14" r="2" fill="#7a1c0e" />
              </g>
              {/* Paw prints scattered along the path */}
              {[
                { x: 130, y: 555 },
                { x: 290, y: 495 },
                { x: 410, y: 460 },
                { x: 530, y: 410 },
                { x: 660, y: 350 },
                { x: 790, y: 295 },
                { x: 930, y: 250 },
                { x: 1040, y: 165 },
              ].map((p, i) => (
                <PawPrint key={i} x={p.x} y={p.y} delay={i * 80} />
              ))}
            </>
          )}

          {isCT && (
            <>
              {/* Boat on the horizon */}
              <g className="jr-decor jr-decor-boat" transform="translate(180, 360)">
                <polygon points="0,0 60,0 50,12 10,12" fill="#f86e4f" />
                <rect x="20" y="-18" width="20" height="18" fill="#fff" />
                <polygon points="30,-30 30,-18 44,-18" fill="#1edee4" />
              </g>
              {/* Tiki torches along the path */}
              {[
                { x: 360, y: 480 },
                { x: 750, y: 290 },
              ].map((p, i) => (
                <g
                  key={i}
                  className="jr-decor jr-decor-torch"
                  transform={`translate(${p.x}, ${p.y})`}
                >
                  <rect x="-2" y="0" width="4" height="36" fill="#7b4f24" />
                  <ellipse cx="0" cy="-2" rx="6" ry="4" fill="#a55b22" />
                  <path
                    className="jr-flame"
                    d="M 0 -4 C -6 -10, -4 -18, 0 -22 C 4 -18, 6 -10, 0 -4 Z"
                    fill="#ffb347"
                  />
                </g>
              ))}
              {/* Palm trees in the foreground */}
              {[
                { x: 90, y: 540 },
                { x: 1060, y: 535 },
              ].map((p, i) => (
                <g
                  key={i}
                  className="jr-decor jr-decor-palm"
                  transform={`translate(${p.x}, ${p.y})`}
                >
                  <rect x="-3" y="-44" width="6" height="44" fill="#7b4f24" rx="2" />
                  <path
                    d="M 0 -42 C -22 -58, -34 -50, -32 -38 M 0 -42 C 22 -58, 34 -50, 32 -38 M 0 -42 C -10 -64, 6 -68, 12 -58 M 0 -42 C 12 -68, -6 -68, -12 -58"
                    stroke="#1a8c4a"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </g>
              ))}
              {/* Wave dashes along the path */}
              {[
                { x: 130, y: 560 },
                { x: 280, y: 500 },
                { x: 430, y: 450 },
                { x: 590, y: 380 },
                { x: 720, y: 320 },
                { x: 870, y: 270 },
                { x: 1000, y: 200 },
              ].map((p, i) => (
                <path
                  key={i}
                  className="jr-decor jr-wave"
                  d={`M ${p.x} ${p.y} q 6 -6 12 0 t 12 0`}
                  stroke="#1edee4"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </>
          )}

          {/* 8. Road shadow */}
          <path
            d={ROAD_PATH}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="40"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            transform="translate(0, 7)"
          />

          {/* 9. White outer edge — drawn first as a wider stroke so the
              asphalt body covers the middle and the white shows as edge
              stripes. */}
          <path
            d={ROAD_PATH}
            stroke="#ffffff"
            strokeWidth="34"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* 10. Asphalt body — slightly narrower than the white path,
              leaves a thin white stripe on each side. */}
          <path
            className="jr-road-body"
            d={ROAD_PATH}
            stroke="#3a4049"
            strokeWidth="30"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* 11. Yellow dashed centerline */}
          <path
            className="jr-road-center"
            d={ROAD_PATH}
            stroke="#f5c842"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeDasharray="14 16"
            fill="none"
          />
        </svg>

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
                  // Stagger the pop-in via per-pin delay; CSS reads it.
                  ["--jr-pin-delay" as string]: `${i * 80}ms`,
                }}
                onClick={() =>
                  setOpenPin((cur) => (cur === stage.num ? null : stage.num))
                }
              >
                {isCurrent && (
                  <span className="journey-pin-here" aria-hidden="true">
                    <span className="journey-pin-here-decor">
                      {theme.decor}
                    </span>
                    <span className="journey-pin-here-text">You are here</span>
                    <span className="journey-pin-here-tip" />
                  </span>
                )}
                <span className="journey-pin-circle">
                  <span className="journey-pin-sheen" aria-hidden="true" />
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
                  <span className="journey-pin-tooltip-tip" aria-hidden="true" />
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

/**
 * Single paw print for HT scenery. Two front pads + two rear pads + the
 * heel pad. Faded-in via CSS using a per-instance animation-delay so
 * paw prints appear to walk along the road on first reveal.
 */
function PawPrint({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g
      className="jr-decor jr-paw"
      transform={`translate(${x}, ${y})`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <ellipse cx="0" cy="0" rx="5" ry="4" fill="#3b2515" />
      <ellipse cx="-6" cy="-5" rx="2.4" ry="2" fill="#3b2515" />
      <ellipse cx="-2" cy="-7" rx="2.4" ry="2" fill="#3b2515" />
      <ellipse cx="3" cy="-7" rx="2.4" ry="2" fill="#3b2515" />
      <ellipse cx="7" cy="-5" rx="2.4" ry="2" fill="#3b2515" />
    </g>
  );
}
