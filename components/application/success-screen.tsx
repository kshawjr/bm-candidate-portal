"use client";

interface Props {
  firstName: string;
  onContinue: () => void;
}

/**
 * Minimal post-submit screen. The Chapter Complete popup (PR 36) is the
 * real celebration moment now — we don't want to compete with it. This
 * screen exists for two cases only:
 *
 *  1. The brief moment between submit and the chapter complete popup
 *     mounting on top of it (usually <1s).
 *  2. A candidate returning to Chapter 1 Step 2 after they've already
 *     submitted, when the popup chain has long since been dismissed and
 *     advanced. We need SOMETHING to render so the step doesn't look
 *     empty — give them a quiet "you're already done" with a way back to
 *     wherever they actually need to be.
 */
export function SuccessScreen({ firstName, onContinue }: Props) {
  return (
    <div className="app-screen app-success">
      <div className="app-success-icon" aria-hidden="true">
        ✓
      </div>
      <h2 className="app-success-title">
        You&apos;re all set, {firstName}.
      </h2>
      <p className="app-success-sub">
        Your application is in. Continue to the next chapter when you&apos;re ready.
      </p>
      <button
        type="button"
        className="app-nav-btn primary app-success-continue"
        onClick={onContinue}
      >
        Continue →
      </button>
    </div>
  );
}
