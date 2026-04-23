"use client";

import { useState, useTransition } from "react";
import {
  ShortTextField,
  SingleSelectField,
  ChipGroupField,
  YesNoWithFollowupField,
  type SelectOption,
  type YesNoWithFollowupValue,
} from "@/components/application/fields";
import {
  ZipLocationField,
  isZipLocationComplete,
  type ZipLocationValue,
} from "@/components/application/zip-location-field";
import {
  MotivationField,
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
import {
  AGE_RANGES,
  MOTIVATIONS,
  SELF_DESCRIPTORS,
} from "@/lib/application-options";

// ---------- Option sets ----------

const OPENING_TIMELINE: SelectOption[] = [
  { value: "asap",         label: "As soon as possible" },
  { value: "3_6_months",   label: "3–6 months" },
  { value: "6_12_months",  label: "6–12 months" },
  { value: "12_plus",      label: "12+ months" },
  { value: "figuring_out", label: "Still figuring it out" },
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
];

const GROWTH_PLAN: SelectOption[] = [
  { value: "one_to_start", label: "Just one to start" },
  { value: "open_to_more", label: "Open to a second or third down the line" },
  { value: "multi_unit",   label: "Multi-unit from the start" },
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
  initialAnswers: Answers;
  isAlreadySubmitted: boolean;
  onSaveAnswer: (fieldKey: string, fieldValue: unknown) => Promise<void>;
  onSubmit: (finalAnswers: Answers) => Promise<void>;
  onContinueToNextChapter: () => void;
}

// ---------- Screen helpers ----------

// Screen layout:
//   0  verification
//   1  Q1 current_role           (Chapter 1: Tell us about you)
//   2  Q2 age_range
//   3  Q3 zip-location
//   4  Q4 motivation
//   5  Chapter 2 intro           (Chapter 2: The money conversation)
//   6  Q5 quick financial check (liquid_capital + net_worth + credit_score)
//   7  Q6 bankruptcy
//   8  Q7 opening_timeline       (Chapter 3: Your plans)
//   9  Q8 involvement_level
//   10 Q9 growth_plan
//   11 Q10 self_descriptor       (Chapter 4: One last thing)
//   12 sign-off
//   13 success
const LAST_INTERACTIVE_IDX = 12; // sign-off
const SUCCESS_IDX = 13;
const TOTAL_SCREENS = 14;
const TOTAL_QUESTIONS = 10;

function progressFor(idx: number): number {
  if (idx >= SUCCESS_IDX) return 100;
  return Math.round((idx / LAST_INTERACTIVE_IDX) * 100);
}

// ---------- Renderer ----------

export function ApplicationRenderer({
  candidate,
  leaderName,
  initialAnswers,
  isAlreadySubmitted,
  onSaveAnswer,
  onSubmit,
  onContinueToNextChapter,
}: Props) {
  // Start candidates who already submitted directly on the success screen
  // so they see confirmation rather than the form again.
  const [idx, setIdx] = useState(isAlreadySubmitted ? SUCCESS_IDX : 0);

  // Flat answers keyed by field_key (same shape as application_responses rows).
  // Pre-filled with candidates.first/last/email/phone for the verification
  // screen; merged over with any stored answers.
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

  // advance(idx+1), persisting the given keys on the way.
  const advanceWithSave = (keys: string[]) => {
    startTransition(async () => {
      for (const k of keys) {
        await onSaveAnswer(k, answers[k]);
      }
      setIdx((i) => i + 1);
    });
  };

  // Back: just decrement, no save (answers stay in state; previously-saved
  // ones stay in DB).
  const goBack = () => setIdx((i) => Math.max(0, i - 1));

  // Submit: batch-save sign-off fields + everything in answers, then fire
  // onSubmit action, then advance to success screen.
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

  // 2: Q2 age_range
  if (idx === 2) {
    const v = (answers.age_range as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 2 of ${TOTAL_QUESTIONS}`}
        question="Roughly how old are you?"
        subCaption="Informational — franchising generally requires 25+, and this helps us tailor the conversation."
        progressPct={p}
        canAdvance={v.length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["age_range"])}
        pending={pending}
      >
        <ChipGroupField
          value={v}
          onChange={(x) => setA({ age_range: x })}
          options={AGE_RANGES}
          ariaLabel="Age range"
        />
      </QuestionScreen>
    );
  }

  // 3: Q3 zip-location
  if (idx === 3) {
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
        eyebrow={`Chapter 1 of 4 · Question 3 of ${TOTAL_QUESTIONS}`}
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

  // 4: Q4 motivation (chip grid with "Other" reveal)
  if (idx === 4) {
    const v: MotivationValue = {
      value: (answers.motivation as string) ?? "",
      otherText: (answers.motivation_other_text as string) ?? "",
    };
    const canAdvance =
      v.value.length > 0 &&
      (v.value !== "other" || v.otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow={`Chapter 1 of 4 · Question 4 of ${TOTAL_QUESTIONS}`}
        question="What's drawing you to this?"
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
              motivation: nv.value,
              motivation_other_text: nv.otherText,
            })
          }
          options={MOTIVATIONS}
        />
      </QuestionScreen>
    );
  }

  // 5: Chapter 2 intro (leaving the money-questions copy to the financial
  // screen's intro card — this is the gentler gear-shift announcement)
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

  // 6: Q5 Quick financial check (liquid capital + net worth + credit score chips)
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

  // 7: Q6 bankruptcy
  if (idx === 7) {
    const v: YesNoWithFollowupValue = {
      answer:
        answers.has_filed_bankruptcy === true
          ? "yes"
          : answers.has_filed_bankruptcy === false
            ? "no"
            : null,
      note: (answers.bankruptcy_note as string) ?? "",
    };
    return (
      <QuestionScreen
        eyebrow={`Chapter 2 of 4 · Question 6 of ${TOTAL_QUESTIONS}`}
        question="Have you ever filed for bankruptcy?"
        progressPct={p}
        canAdvance={v.answer !== null}
        onBack={goBack}
        onNext={() =>
          advanceWithSave(["has_filed_bankruptcy", "bankruptcy_note"])
        }
        pending={pending}
      >
        <YesNoWithFollowupField
          value={v}
          onChange={(nv) =>
            setA({
              has_filed_bankruptcy: nv.answer === "yes",
              bankruptcy_note: nv.note,
            })
          }
          followupLabel="Want to share anything about that? (Optional)"
        />
      </QuestionScreen>
    );
  }

  // 8: Q7 opening timeline
  if (idx === 8) {
    const v = (answers.opening_timeline as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 7 of ${TOTAL_QUESTIONS}`}
        question="When would you want to open?"
        progressPct={p}
        canAdvance={v.length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["opening_timeline"])}
        pending={pending}
      >
        <SingleSelectField
          value={v}
          onChange={(x) => setA({ opening_timeline: x })}
          options={OPENING_TIMELINE}
        />
      </QuestionScreen>
    );
  }

  // 9: Q8 involvement level
  if (idx === 9) {
    const v = (answers.involvement_level as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 8 of ${TOTAL_QUESTIONS}`}
        question="How hands-on do you want to be?"
        progressPct={p}
        canAdvance={v.length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["involvement_level"])}
        pending={pending}
      >
        <SingleSelectField
          value={v}
          onChange={(x) => setA({ involvement_level: x })}
          options={INVOLVEMENT_LEVELS}
        />
      </QuestionScreen>
    );
  }

  // 10: Q9 growth plan
  if (idx === 10) {
    const v = (answers.growth_plan as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 3 of 4 · Question 9 of ${TOTAL_QUESTIONS}`}
        question="One location, or building a portfolio?"
        progressPct={p}
        canAdvance={v.length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["growth_plan"])}
        pending={pending}
      >
        <SingleSelectField
          value={v}
          onChange={(x) => setA({ growth_plan: x })}
          options={GROWTH_PLAN}
        />
      </QuestionScreen>
    );
  }

  // 11: Q10 self descriptor (playful closing question)
  if (idx === 11) {
    const v = (answers.self_descriptor as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={`Chapter 4 of 4 · Question 10 of ${TOTAL_QUESTIONS}`}
        question="One last one — which word describes you best?"
        subCaption="There's no wrong answer. We're just curious."
        progressPct={p}
        canAdvance={v.length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["self_descriptor"])}
        pending={pending}
      >
        <div className="self-descriptor-wrap">
          <ChipGroupField
            value={v}
            onChange={(x) => setA({ self_descriptor: x })}
            options={SELF_DESCRIPTORS}
            ariaLabel="Which word describes you best"
          />
        </div>
      </QuestionScreen>
    );
  }

  // 12: Sign-off
  if (idx === 12) {
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

  // 13: Success
  return (
    <SuccessScreen
      firstName={candidate.first_name}
      leaderName={leaderName}
      onContinue={onContinueToNextChapter}
    />
  );
}

// Export so the shell's dispatch can reason about totals if needed later.
export { TOTAL_SCREENS };
