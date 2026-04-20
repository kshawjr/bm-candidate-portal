"use client";

import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  question: string;
  subCaption?: string;
  progressPct: number;
  canAdvance: boolean;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  pending?: boolean;
  children: ReactNode;
}

export function QuestionScreen({
  eyebrow,
  question,
  subCaption,
  progressPct,
  canAdvance,
  onBack,
  onNext,
  nextLabel = "Next →",
  pending = false,
  children,
}: Props) {
  return (
    <div className="app-screen">
      <div className="app-progress">
        <div className="app-progress-bar">
          <div
            className="app-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="app-progress-meta">{eyebrow}</div>
      </div>

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
