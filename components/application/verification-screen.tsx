"use client";

import { QuestionScreen } from "./question-screen";

export interface VerifiedContact {
  name: string;
  email: string;
  phone: string;
}

interface Props {
  value: VerifiedContact;
  onChange: (v: VerifiedContact) => void;
  onNext: () => void;
  progressPct: number;
  pending?: boolean;
  /** PR 42: shown as a small hint under the phone field when the value
   *  was prefilled (from candidates_in_portal.prefilled_phone). Field is
   *  still editable. */
  phoneIsPrefilled: boolean;
}

export function VerificationScreen({
  value,
  onChange,
  onNext,
  progressPct,
  pending,
  phoneIsPrefilled,
}: Props) {
  const canAdvance =
    value.name.trim().length > 0 &&
    value.email.trim().length > 0 &&
    value.phone.trim().length > 0;

  return (
    <QuestionScreen
      eyebrow="Quick check"
      question="Real quick — can you confirm this is right?"
      subCaption="We pulled this from what you submitted earlier. Edit anything that's off."
      progressPct={progressPct}
      canAdvance={canAdvance}
      onNext={onNext}
      nextLabel="Looks good →"
      pending={pending}
    >
      <div className="app-verify-grid">
        <label className="app-field-col">
          <span className="app-field-sublabel">Name</span>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="app-field-input"
            autoFocus
          />
        </label>
        <label className="app-field-col">
          <span className="app-field-sublabel">Email</span>
          <input
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            className="app-field-input"
          />
        </label>
        <label className="app-field-col">
          <span className="app-field-sublabel">Phone</span>
          <input
            type="tel"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            className="app-field-input"
          />
          {phoneIsPrefilled && (
            <span className="app-field-hint app-field-hint-prefilled">
              Prefilled from your record
            </span>
          )}
        </label>
      </div>
    </QuestionScreen>
  );
}
