"use client";

import type { ReactNode } from "react";

interface Props {
  question: string;
  subCaption?: string;
  canAdvance: boolean;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  pending?: boolean;
  children: ReactNode;
}

// Per-screen progress bar + eyebrow were removed in the polish layer
// (Phase 1) — the new MacroProgress component above the screen owns
// both. Kept the rest of the screen chrome untouched: question heading,
// optional sub-caption, the field children, and the back/next nav.
export function QuestionScreen({
  question,
  subCaption,
  canAdvance,
  onBack,
  onNext,
  nextLabel = "Next →",
  pending = false,
  children,
}: Props) {
  return (
    <div className="app-screen">
      <h2 className="app-question">{question}</h2>
      {subCaption && <p className="app-sub-caption">{subCaption}</p>}

      <div className="app-field">{children}</div>

      <div className="app-nav">
        {onBack ? (
          <button
            type="button"
            className="app-nav-btn"
            onClick={onBack}
            disabled={pending}
          >
            ← Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="app-nav-btn primary"
          onClick={onNext}
          disabled={!canAdvance || pending}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
