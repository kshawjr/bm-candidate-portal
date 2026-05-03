"use client";

import { useState, useTransition } from "react";
import {
  ShortTextField,
  SingleSelectField,
  ChipGroupField,
  type SelectOption,
} from "@/components/application/fields";
import {
  ZipLocationField,
  isZipLocationComplete,
  type ZipLocationValue,
} from "@/components/application/zip-location-field";
import {
  MotivationField,
  motivationElaborationPrompt,
  type MotivationValue,
} from "@/components/application/motivation-field";
import { QuestionScreen } from "@/components/application/question-screen";
import {
  VerificationScreen,
  type VerifiedContact,
} from "@/components/application/verification-screen";
import { ChapterIntroScreen } from "@/components/application/chapter-intro-screen";
import { FinancialCheckScreen } from "@/components/application/financial-check-screen";
import { SignOffScreen } from "@/components/application/sign-off-screen";
import { SuccessScreen } from "@/components/application/success-screen";
import { MOTIVATIONS } from "@/lib/application-options";
import { brandClosingQuestion } from "@/lib/brand-closing-questions";

// ---------- Option sets ----------
//
// PR 37 added an "Other" chip to opening_timeline / involvement_level /
// growth_plan and routes its free-text into a dedicated *_other_text key.

const OTHER_VALUE = "other";

const OPENING_TIMELINE: SelectOption[] = [
  { value: "asap",         label: "As soon as possible" },
  { value: "3_6_months",   label: "3–6 months" },
  { value: "6_12_months",  label: "6–12 months" },
  { value: "12_plus",      label: "12+ months" },
  { value: "figuring_out", label: "Still figuring it out" },
  { value: OTHER_VALUE,    label: "Other" },
];

const INVOLVEMENT_LEVELS: SelectOption[] = [
  {
    value: "owner_operator",
    label: "Owner-operator",
    desc: "I want to run this day to day",
  },
  {
    value: "semi_absentee",
    label: "Semi-absentee",
    desc: "I'll be involved, but I'll hire a manager",
  },
  {
    value: "absentee",
    label: "Absentee",
    desc: "I want to own it, not operate it",
  },
  { value: OTHER_VALUE, label: "Other" },
];

const GROWTH_PLAN: SelectOption[] = [
  { value: "one_to_start", label: "Just one to start" },
  { value: "open_to_more", label: "Open to a second or third down the line" },
  { value: "multi_unit",   label: "Multi-unit from the start" },
  { value: OTHER_VALUE,    label: "Other" },
];

// ---------- Types ----------

export interface ApplicationCandidate {
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
}

type Answers = Record<string, unknown>;

interface Props {
  candidate: ApplicationCandidate;
  leaderName: string;
  /** Brand slug for the candidate's brand. Drives the per-brand closing
   *  question (PR 37). Unknown slugs fall back to a generic chip set. */
  brandSlug: string;
  /** Optional ZIP prefilled at candidate creation time. When set, the
   *  ZIP step skips the cold-input box and lands on the confirmation
   *  card. Null/empty → existing cold flow. */
  prefilledZip: string | null;
  initialAnswers: Answers;
  isAlreadySubmitted: boolean;
  onSaveAnswer: (fieldKey: string, fieldValue: unknown) => Promise<void>;
  onSubmit: (finalAnswers: Answers) => Promise<void>;
  onContinueToNextChapter: () => void;
}

// ---------- Screen indices ----------
//
//   0  verification
//   1  Q1  current_role            (Chapter 1 of 4 · About you)
//   2  Q2  zip-location
//   3  Q3  motivation (multi)
//   4  Q4  motivation elaboration  ← own question per PR 37 counter
//   5  Chapter 2 intro             (Chapter 2 of 4 · The money conversation)
//   6  Q5  quick financial check
//   7  Q6  bankruptcy              (Background check sub-section)
//   8  Q7  felony
//   9  Q8  opening_timeline        (Chapter 3 of 4 · Your plans)
//   10 Q9  involvement_level
//   11 Q10 growth_plan
//   12 Q11 brand-specific closing  (Chapter 4 of 4 · One last thing)
//   13 sign-off
//   14 success
const SUCCESS_IDX = 14;
const LAST_INTERACTIVE_IDX = 13;
const TOTAL_QUESTIONS = 11;

function progressFor(idx: number): number {
  if (idx >= SUCCESS_IDX) return 100;
  return Math.round((idx / LAST_INTERACTIVE_IDX) * 100);
}

// Helper: parse the stored motivation value. Older rows may contain a
// single-string value (PR 27) or no value. Coerce to the current
// MotivationValue shape (multi-select array).
function parseMotivation(raw: unknown, otherText: unknown): MotivationValue {
  let selected: string[] = [];
  if (Array.isArray(raw)) {
    selected = (raw as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
  } else if (typeof raw === "string" && raw.length > 0) {
    selected = [raw];
  }
  return {
    selected,
    otherText: typeof otherText === "string" ? otherText : "",
  };
}

// ---------- Renderer ----------

export function ApplicationRenderer({
  candidate,
  leaderName,
  brandSlug,
  prefilledZip,
  initialAnswers,
  isAlreadySubmitted,
  onSaveAnswer,
  onSubmit,
  onContinueToNextChapter,
}: Props) {
  // Start candidates who already submitted directly on the success screen
  // so they see confirmation rather than the form again.
  const [idx, setIdx] = useState(isAlreadySubmitted ? SUCCESS_IDX : 0);

  const fullName = [candidate.first_name, candidate.last_name]
    .filter(Boolean)
    .join(" ");
  const [answers, setAnswers] = useState<Answers>(() => ({
    verified_name: fullName,
    verified_email: candidate.email,
    verified_phone: candidate.phone ?? "",
    ...initialAnswers,
  }));

  const [pending, startTransition] = useTransition();

  const setA = (patch: Answers) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  const advanceWithSave = (keys: string[]) => {
    startTransition(async () => {
      for (const k of keys) {
        await onSaveAnswer(k, answers[k]);
      }
      setIdx((i) => i + 1);
    });
  };

  const goBack = () => setIdx((i) => Math.max(0, i - 1));

  const handleSubmit = (signatureName: string) => {
    const finalAnswers: Answers = {
      ...answers,
      signature_name: signatureName,
      agreement_accepted: true,
    };
    startTransition(async () => {
      await onSubmit(finalAnswers);
      setAnswers(finalAnswers);
      setIdx(SUCCESS_IDX);
    });
  };

  const p = progressFor(idx);
  const closingQ = brandClosingQuestion(brandSlug);

  // ---- Screen rendering ----

  // 0: Verification
  if (idx === 0) {
    const v: VerifiedContact = {
      name: (answers.verified_name as string) ?? "",
      email: (answers.verified_email as string) ?? "",
      phone: (answers.verified_phone as string) ?? "",
    };
    return (
      <VerificationScreen
        value={v}
        onChange={(nv) =>
          setA({
            verified_name: nv.name,
            verified_email: nv.email,
            verified_phone: nv.phone,
          })
        }
        onNext={() =>
          advanceWithSave(["verified_name", "verified_email", "verified_phone"])
        }
        progressPct={p}
        pending={pending}
      />
    );
  }

  // 1: Q1 current_role
  if (idx === 1) {
    const v = (answers.current_role as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 1 of ${TOTAL_QUESTIONS}`}
        question="What do you do now?"
        progressPct={p}
        canAdvance={v.trim().length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["current_role"])}
        pending={pending}
      >
        <ShortTextField
          value={v}
          onChange={(x) => setA({ current_role: x })}
          placeholder="Franchise consultant, real estate, etc."
        />
      </QuestionScreen>
    );
  }

  // 2: Q2 zip-location
  if (idx === 2) {
    const v: ZipLocationValue = {
      zip: (answers.zip_code as string) ?? "",
      derivedCity: (answers.derived_city as string) ?? "",
      derivedState: (answers.derived_state as string) ?? "",
      confirmed:
        answers.target_location_confirmed === true
          ? "yes"
          : answers.target_location_confirmed === false
            ? "no"
            : null,
      otherText: (answers.target_location_other as string) ?? "",
      manualFallback: Boolean(answers.zip_manual_fallback),
    };
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 2 of ${TOTAL_QUESTIONS}`}
        question="Where are you?"
        progressPct={p}
        canAdvance={isZipLocationComplete(v)}
        onBack={goBack}
        onNext={() =>
          advanceWithSave([
            "zip_code",
            "derived_city",
            "derived_state",
            "target_location_confirmed",
            "target_location_other",
            "zip_manual_fallback",
          ])
        }
        pending={pending}
      >
        <ZipLocationField
          value={v}
          prefilledZip={prefilledZip}
          onChange={(nv) =>
            setA({
              zip_code: nv.zip,
              derived_city: nv.derivedCity,
              derived_state: nv.derivedState,
              target_location_confirmed:
                nv.confirmed === null ? null : nv.confirmed === "yes",
              target_location_other: nv.otherText,
              zip_manual_fallback: nv.manualFallback,
            })
          }
        />
      </QuestionScreen>
    );
  }

  // 3: Q3 motivation (multi-select chips)
  if (idx === 3) {
    const v = parseMotivation(answers.motivation, answers.motivation_other_text);
    const hasOther = v.selected.includes(OTHER_VALUE);
    const canAdvance =
      v.selected.length > 0 &&
      (!hasOther || v.otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 3 of ${TOTAL_QUESTIONS}`}
        question="What's drawing you to this?"
        subCaption="Pick all that apply."
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() => advanceWithSave(["motivation", "motivation_other_text"])}
        pending={pending}
      >
        <MotivationField
          value={v}
          onChange={(nv) =>
            setA({
              motivation: nv.selected,
              motivation_other_text: nv.otherText,
            })
          }
          options={MOTIVATIONS}
        />
      </QuestionScreen>
    );
  }

  // 4: Q4 motivation elaboration — contextual follow-up referencing chips
  if (idx === 4) {
    const v = parseMotivation(answers.motivation, answers.motivation_other_text);
    const elaboration = (answers.motivation_elaboration as string) ?? "";
    const prompt = motivationElaborationPrompt(v, MOTIVATIONS);
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 4 of ${TOTAL_QUESTIONS}`}
        question="Tell us more"
        subCaption={prompt}
        progressPct={p}
        canAdvance={elaboration.trim().length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["motivation_elaboration"])}
        pending={pending}
      >
        <textarea
          value={elaboration}
          onChange={(e) => setA({ motivation_elaboration: e.target.value })}
          className="app-field-textarea"
          rows={5}
          placeholder="A sentence or two — what's the pull?"
          autoFocus
        />
      </QuestionScreen>
    );
  }

  // 5: Chapter 2 intro
  if (idx === 5) {
    return (
      <ChapterIntroScreen
        eyebrow="Chapter 2 of 4 · The money conversation"
        body="Next up — a quick financial check. We're not judging, and none of this automatically disqualifies you. It just helps us match you to the right territory."
        onContinue={() => setIdx(6)}
        progressPct={p}
      />
    );
  }

  // 6: Q4 quick financial check (liquid + net worth + credit)
  if (idx === 6) {
    const v = {
      liquid_capital_range: (answers.liquid_capital_range as string) ?? "",
      net_worth_range: (answers.net_worth_range as string) ?? "",
      credit_score_range: (answers.credit_score_range as string) ?? "",
    };
    return (
      <FinancialCheckScreen
        value={v}
        onChange={(patch) => setA(patch)}
        progressPct={p}
        eyebrow={`Chapter 2 of 4 · Question 5 of ${TOTAL_QUESTIONS}`}
        onBack={goBack}
        onNext={() =>
          advanceWithSave([
            "liquid_capital_range",
            "net_worth_range",
            "credit_score_range",
          ])
        }
        pending={pending}
      />
    );
  }

  // 7: Q5 bankruptcy (background check sub-section)
  if (idx === 7) {
    const v: YesNoExplain = {
      answer:
        answers.has_filed_bankruptcy === true
          ? "yes"
          : answers.has_filed_bankruptcy === false
            ? "no"
            : null,
      explanation: (answers.bankruptcy_explanation as string) ?? "",
    };
    const canAdvance =
      v.answer === "no" ||
      (v.answer === "yes" && v.explanation.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 2 of 4 · Background check · Question 6 of ${TOTAL_QUESTIONS}`}
        question="Have you ever filed for bankruptcy?"
        subCaption="Quick yes/no — none of these are automatic disqualifiers, but we need to know."
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave(["has_filed_bankruptcy", "bankruptcy_explanation"])
        }
        pending={pending}
      >
        <YesNoExplainField
          value={v}
          onChange={(nv) =>
            setA({
              has_filed_bankruptcy:
                nv.answer === null ? null : nv.answer === "yes",
              bankruptcy_explanation: nv.explanation,
            })
          }
          followupLabel="When and what happened?"
        />
      </QuestionScreen>
    );
  }

  // 8: Q6 felony
  if (idx === 8) {
    const v: YesNoExplain = {
      answer:
        answers.has_felony === true
          ? "yes"
          : answers.has_felony === false
            ? "no"
            : null,
      explanation: (answers.felony_explanation as string) ?? "",
    };
    const canAdvance =
      v.answer === "no" ||
      (v.answer === "yes" && v.explanation.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 2 of 4 · Background check · Question 7 of ${TOTAL_QUESTIONS}`}
        question="Have you ever been convicted of a felony?"
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() => advanceWithSave(["has_felony", "felony_explanation"])}
        pending={pending}
      >
        <YesNoExplainField
          value={v}
          onChange={(nv) =>
            setA({
              has_felony: nv.answer === null ? null : nv.answer === "yes",
              felony_explanation: nv.explanation,
            })
          }
          followupLabel="When and what was the outcome?"
        />
      </QuestionScreen>
    );
  }

  // 9: Q7 opening timeline (with Other reveal)
  if (idx === 9) {
    const v = (answers.opening_timeline as string) ?? "";
    const otherText = (answers.opening_timeline_other_text as string) ?? "";
    const canAdvance =
      v.length > 0 && (v !== OTHER_VALUE || otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 8 of ${TOTAL_QUESTIONS}`}
        question="When would you want to open?"
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave(["opening_timeline", "opening_timeline_other_text"])
        }
        pending={pending}
      >
        <SelectWithOther
          value={v}
          otherText={otherText}
          options={OPENING_TIMELINE}
          onChange={(value, text) =>
            setA({
              opening_timeline: value,
              opening_timeline_other_text: text,
            })
          }
          otherPlaceholder="Tell us more about your timing"
        />
      </QuestionScreen>
    );
  }

  // 10: Q8 involvement level (with Other reveal)
  if (idx === 10) {
    const v = (answers.involvement_level as string) ?? "";
    const otherText = (answers.involvement_level_other_text as string) ?? "";
    const canAdvance =
      v.length > 0 && (v !== OTHER_VALUE || otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 9 of ${TOTAL_QUESTIONS}`}
        question="How hands-on do you want to be?"
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave([
            "involvement_level",
            "involvement_level_other_text",
          ])
        }
        pending={pending}
      >
        <SelectWithOther
          value={v}
          otherText={otherText}
          options={INVOLVEMENT_LEVELS}
          onChange={(value, text) =>
            setA({
              involvement_level: value,
              involvement_level_other_text: text,
            })
          }
          otherPlaceholder="Tell us how you'd want to be involved"
        />
      </QuestionScreen>
    );
  }

  // 11: Q9 growth plan (with Other reveal)
  if (idx === 11) {
    const v = (answers.growth_plan as string) ?? "";
    const otherText = (answers.growth_plan_other_text as string) ?? "";
    const canAdvance =
      v.length > 0 && (v !== OTHER_VALUE || otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 10 of ${TOTAL_QUESTIONS}`}
        question="One location, or building a portfolio?"
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave(["growth_plan", "growth_plan_other_text"])
        }
        pending={pending}
      >
        <SelectWithOther
          value={v}
          otherText={otherText}
          options={GROWTH_PLAN}
          onChange={(value, text) =>
            setA({
              growth_plan: value,
              growth_plan_other_text: text,
            })
          }
          otherPlaceholder="Tell us about your growth plans"
        />
      </QuestionScreen>
    );
  }

  // 12: Q10 brand-specific closing question
  if (idx === 12) {
    const v = (answers.brand_closing_response as string) ?? "";
    const otherText = (answers.brand_closing_response_other as string) ?? "";
    const canAdvance =
      v.length > 0 && (v !== OTHER_VALUE || otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 4 of 4 · Question 11 of ${TOTAL_QUESTIONS}`}
        question={closingQ.question}
        subCaption={closingQ.subCaption}
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave([
            "brand_closing_response",
            "brand_closing_response_other",
          ])
        }
        pending={pending}
      >
        <div className="self-descriptor-wrap">
          <ChipGroupField
            value={v}
            onChange={(x) =>
              setA({
                brand_closing_response: x,
                // Clear other text when switching off Other so a stale
                // value doesn't sneak into the saved row.
                brand_closing_response_other:
                  x === OTHER_VALUE ? otherText : "",
              })
            }
            options={closingQ.options}
            ariaLabel={closingQ.question}
          />
          {v === OTHER_VALUE && (
            <label className="app-followup-label">
              <span className="app-field-sublabel">Tell us more</span>
              <input
                type="text"
                value={otherText}
                onChange={(e) =>
                  setA({ brand_closing_response_other: e.target.value })
                }
                placeholder="Anything you'd like to share"
                className="app-field-input"
                autoFocus
              />
            </label>
          )}
        </div>
      </QuestionScreen>
    );
  }

  // 13: Sign-off
  if (idx === 13) {
    return (
      <SignOffScreen
        initialName={(answers.verified_name as string) ?? ""}
        onSubmit={handleSubmit}
        onBack={goBack}
        progressPct={p}
        pending={pending}
      />
    );
  }

  // 14: Success — minimal transitional placeholder. The chapter complete
  // popup (PR 36) is the real celebration; this screen exists only to
  // bridge the moment between submit and the popup, and to handle
  // already-submitted candidates returning to Chapter 1 Step 2.
  return (
    <SuccessScreen
      firstName={candidate.first_name}
      onContinue={onContinueToNextChapter}
    />
  );
}

// ---------- Yes/No with REQUIRED explanation when Yes ----------

interface YesNoExplain {
  answer: "yes" | "no" | null;
  explanation: string;
}

function YesNoExplainField({
  value,
  onChange,
  followupLabel,
}: {
  value: YesNoExplain;
  onChange: (v: YesNoExplain) => void;
  followupLabel: string;
}) {
  return (
    <div>
      <div className="app-toggle-row">
        <button
          type="button"
          className={`app-toggle${value.answer === "no" ? " active" : ""}`}
          onClick={() => onChange({ answer: "no", explanation: "" })}
        >
          No
        </button>
        <button
          type="button"
          className={`app-toggle${value.answer === "yes" ? " active" : ""}`}
          onClick={() =>
            onChange({ answer: "yes", explanation: value.explanation })
          }
        >
          Yes
        </button>
      </div>
      {value.answer === "yes" && (
        <label className="app-followup-label">
          <span className="app-field-sublabel">
            {followupLabel}{" "}
            <span className="app-form-required" aria-hidden="true">
              *
            </span>
          </span>
          <textarea
            value={value.explanation}
            onChange={(e) =>
              onChange({ answer: "yes", explanation: e.target.value })
            }
            className="app-field-textarea"
            rows={3}
            placeholder="A short explanation"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}

// ---------- SingleSelect with "Other" reveal ----------

function SelectWithOther({
  value,
  otherText,
  options,
  onChange,
  otherPlaceholder,
}: {
  value: string;
  otherText: string;
  options: SelectOption[];
  onChange: (value: string, otherText: string) => void;
  otherPlaceholder: string;
}) {
  return (
    <div>
      <SingleSelectField
        value={value}
        onChange={(x) =>
          // Clear otherText when switching off Other so we don't ship
          // stale free-text alongside a non-Other selection.
          onChange(x, x === OTHER_VALUE ? otherText : "")
        }
        options={options}
      />
      {value === OTHER_VALUE && (
        <label className="app-followup-label">
          <span className="app-field-sublabel">Tell us more</span>
          <input
            type="text"
            value={otherText}
            onChange={(e) => onChange(OTHER_VALUE, e.target.value)}
            placeholder={otherPlaceholder}
            className="app-field-input"
            autoFocus
          />
        </label>
      )}
    </div>
  );
}
