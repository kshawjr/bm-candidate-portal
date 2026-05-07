"use client";

// Macro progress header for the candidate application. Sits above every
// question screen and shows the candidate's location in the flow at two
// granularities at once:
//
//   1. Section dots — one per section (7 today, sourced from
//      SECTION_BY_IDX in the renderer). Future / active / complete states.
//      Active dot pulses subtly to draw the eye.
//   2. Section title + question counter — the active section's name in
//      display type, with "Question X of N" right-aligned. Cross-fades on
//      section change.
//   3. Thin progress bar — question-level granularity. Springs forward on
//      each Next click.
//
// Replaces the section-pill / time-estimate cluster's section component
// from PR 39. Time estimate and SaveIndicator continue to ride alongside
// — they serve different purposes (time-expectation, save-confidence).
//
// All animation respects `prefers-reduced-motion`. With reduced motion
// on: dots don't pulse, bar fills instantly, title swaps without
// fade/translate.

import { motion, useReducedMotion } from "framer-motion";

export interface MacroSection {
  /** 1-indexed display number ("Section 3 of 7"). */
  num: number;
  /** Title shown in the active-section row ("Personal", "Money"). */
  title: string;
}

interface Props {
  sections: MacroSection[];
  /** 1-indexed; matches MacroSection.num. */
  currentSectionNum: number;
  /** 1-indexed question position the candidate is on. Use `null` for
   *  non-question screens (chapter intros, sign-off) so the counter
   *  hides without breaking the layout. */
  currentQuestionNum: number | null;
  totalQuestions: number;
  /** 0..100 — drives the thin progress bar. */
  progressPct: number;
}

export function MacroProgress({
  sections,
  currentSectionNum,
  currentQuestionNum,
  totalQuestions,
  progressPct,
}: Props) {
  const reduceMotion = useReducedMotion();
  const active = sections.find((s) => s.num === currentSectionNum) ?? null;

  return (
    <div className="app-macro-progress" aria-label="Application progress">
      <div className="app-macro-dots" role="list">
        {sections.map((section) => {
          const state =
            section.num < currentSectionNum
              ? "complete"
              : section.num === currentSectionNum
                ? "active"
                : "future";
          const showLabel = state === "active";
          return (
            <div
              key={section.num}
              className={`app-macro-dot-wrap app-macro-dot-wrap--${state}`}
              role="listitem"
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "active" && !reduceMotion ? (
                <motion.div
                  className="app-macro-dot app-macro-dot--active"
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  aria-hidden="true"
                >
                  <span className="app-macro-dot-inner" />
                </motion.div>
              ) : state === "active" ? (
                <div
                  className="app-macro-dot app-macro-dot--active"
                  aria-hidden="true"
                >
                  <span className="app-macro-dot-inner" />
                </div>
              ) : state === "complete" ? (
                <div
                  className="app-macro-dot app-macro-dot--complete"
                  aria-hidden="true"
                >
                  <CheckGlyph />
                </div>
              ) : (
                <div
                  className="app-macro-dot app-macro-dot--future"
                  aria-hidden="true"
                />
              )}
              {showLabel && (
                <span className="app-macro-dot-label">{section.title}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="app-macro-title-row">
        <div className="app-macro-title-block">
          <div className="app-macro-eyebrow">
            Section {currentSectionNum} of {sections.length}
          </div>
          {/* AnimatePresence isn't needed here — keying the title element
              re-mounts it on section change, and reduced-motion users
              just see an instant swap because the variants below collapse
              to no transform. */}
          <motion.h2
            key={active?.num ?? "none"}
            className="app-macro-title"
            initial={
              reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.35, ease: "easeOut" }
            }
          >
            {active?.title ?? ""}
          </motion.h2>
        </div>
        {currentQuestionNum !== null && (
          <div className="app-macro-counter">
            Question {currentQuestionNum} of {totalQuestions}
          </div>
        )}
      </div>

      <div className="app-macro-bar" aria-hidden="true">
        <motion.div
          className="app-macro-bar-fill"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : {
                  // Slight spring overshoot — lands as the new question
                  // arrives so the motion feels responsive, not jittery.
                  duration: 0.6,
                  ease: [0.34, 1.56, 0.64, 1],
                }
          }
        />
      </div>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 6.5L5 9.5L10 3.5" />
    </svg>
  );
}
