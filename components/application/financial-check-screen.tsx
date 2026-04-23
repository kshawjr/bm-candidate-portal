"use client";

import { ChipGroupField } from "./fields";
import {
  LIQUID_CAPITAL_RANGES,
  NET_WORTH_RANGES,
  CREDIT_SCORE_RANGES,
} from "@/lib/application-options";

interface FinancialAnswers {
  liquid_capital_range: string;
  net_worth_range: string;
  credit_score_range: string;
}

interface Props {
  value: FinancialAnswers;
  onChange: (patch: Partial<FinancialAnswers>) => void;
  progressPct: number;
  onBack: () => void;
  onNext: () => void;
  pending: boolean;
}

export function FinancialCheckScreen({
  value,
  onChange,
  progressPct,
  onBack,
  onNext,
  pending,
}: Props) {
  // Progressive reveal: each question only appears after the prior one has an
  // answer. Liquid capital is always visible.
  const showNetWorth = value.liquid_capital_range.length > 0;
  const showCreditScore = showNetWorth && value.net_worth_range.length > 0;
  const canAdvance =
    value.liquid_capital_range.length > 0 &&
    value.net_worth_range.length > 0 &&
    value.credit_score_range.length > 0;

  return (
    <div className="app-screen">
      <div className="app-progress">
        <div className="app-progress-bar">
          <div
            className="app-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="app-progress-meta">Chapter 2 of 4 · Quick financial check</div>
      </div>

      <div className="financial-section">
        <div className="financial-section-header">
          <h2 className="financial-section-eyebrow">Quick financial check</h2>
          <p className="financial-section-subhead">
            No documents needed yet — just ranges.
          </p>
        </div>

        <div className="financial-question visible">
          <p className="financial-question-prompt">
            Roughly, how much liquid capital could you invest?
          </p>
          <ChipGroupField
            value={value.liquid_capital_range}
            onChange={(v) => onChange({ liquid_capital_range: v })}
            options={LIQUID_CAPITAL_RANGES}
            ariaLabel="Liquid capital"
          />
        </div>

        <div className={`financial-question${showNetWorth ? " visible" : ""}`}>
          <p className="financial-question-prompt">Ballpark net worth?</p>
          <ChipGroupField
            value={value.net_worth_range}
            onChange={(v) => onChange({ net_worth_range: v })}
            options={NET_WORTH_RANGES}
            ariaLabel="Net worth"
          />
        </div>

        <div className={`financial-question${showCreditScore ? " visible" : ""}`}>
          <p className="financial-question-prompt">What&apos;s your credit range?</p>
          <ChipGroupField
            value={value.credit_score_range}
            onChange={(v) => onChange({ credit_score_range: v })}
            options={CREDIT_SCORE_RANGES}
            ariaLabel="Credit score range"
          />
        </div>
      </div>

      <div className="app-nav">
        <button
          type="button"
          className="app-nav-btn"
          onClick={onBack}
          disabled={pending}
        >
          ← Back
        </button>
        <button
          type="button"
          className="app-nav-btn primary"
          onClick={onNext}
          disabled={!canAdvance || pending}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
