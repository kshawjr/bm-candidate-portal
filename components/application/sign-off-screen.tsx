"use client";

import { useState } from "react";

interface Props {
  initialName: string;
  onSubmit: (signatureName: string) => void;
  onBack: () => void;
  progressPct: number;
  pending?: boolean;
}

export function SignOffScreen({
  initialName,
  onSubmit,
  onBack,
  progressPct,
  pending,
}: Props) {
  const [name, setName] = useState(initialName);
  const [agreed, setAgreed] = useState(false);

  const canSubmit = name.trim().length > 0 && agreed;

  return (
    <div className="app-screen">
      <div className="app-progress">
        <div className="app-progress-bar">
          <div
            className="app-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="app-progress-meta">Final step</div>
      </div>

      <h2 className="app-question">Make it official</h2>
      <p className="app-sub-caption">
        One signature and you're done.
      </p>

      <div className="app-field">
        <label className="app-field-col">
          <span className="app-field-sublabel">
            Type your full name as your digital signature
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="app-field-input app-signature-input"
            autoFocus
          />
        </label>
      </div>

      <label className="app-agreement">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I confirm the information above is accurate to the best of my
          knowledge and agree to be contacted about this opportunity.
        </span>
      </label>

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
          onClick={() => onSubmit(name.trim())}
          disabled={!canSubmit || pending}
        >
          {pending ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </div>
  );
}
