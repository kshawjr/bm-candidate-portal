"use client";

import { useState, useTransition } from "react";
import {
  ShortTextField,
  LongTextField,
  SingleSelectField,
  SingleSelectWithOtherField,
  StateMetroField,
  YesNoWithFollowupField,
  type SelectOption,
  type YesNoWithFollowupValue,
  type SelectWithOtherValue,
} from "@/components/application/fields";
import { QuestionScreen } from "@/components/application/question-screen";
import {
  VerificationScreen,
  type VerifiedContact,
} from "@/components/application/verification-screen";
import { ChapterIntroScreen } from "@/components/application/chapter-intro-screen";
import { FinancialCheckScreen } from "@/components/application/financial-check-screen";
import { SignOffScreen } from "@/components/application/sign-off-screen";
import { SuccessScreen } from "@/components/application/success-screen";

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

const DISCOVERY_SOURCES: SelectOption[] = [
  { value: "online_search",     label: "Online search" },
  { value: "referral",          label: "Referral from a friend or colleague" },
  { value: "social_media",      label: "Social media" },
  { value: "expo",              label: "Franchise expo or event" },
  { value: "broker_consultant", label: "Broker or consultant" },
  { value: "other",             label: "Other" },
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

// Total number of screens including success; progress uses (idx / (LAST_INTERACTIVE))
// Screen layout:
//   0  verification
//   1  Q1 current_role
//   2  Q2 location
//   3  Q3 motivation
//   4  Chapter 2 intro
//   5  Quick financial check (liquid_capital + net_worth + credit_score)
//   6  Q7 bankruptcy
//   7  Q8 opening_timeline
//   8  Q9 involvement_level
//   9  Q10 growth_plan
//   10 Q11 discovery_source
//   11 sign-off
//   12 success
const LAST_INTERACTIVE_IDX = 11; // sign-off
const SUCCESS_IDX = 12;
const TOTAL_SCREENS = 13;

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
        eyebrow="Chapter 1 of 4 · Question 1 of 11"
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

  // 2: Q2 location (state + metro)
  if (idx === 2) {
    const v = {
      state: (answers.location_state as string) ?? "",
      metro: (answers.location_metro as string) ?? "",
    };
    return (
      <QuestionScreen
        eyebrow="Chapter 1 of 4 · Question 2 of 11"
        question="Where are you?"
        progressPct={p}
        canAdvance={v.state.length > 0 && v.metro.trim().length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["location_state", "location_metro"])}
        pending={pending}
      >
        <StateMetroField
          value={v}
          onChange={(nv) =>
            setA({ location_state: nv.state, location_metro: nv.metro })
          }
        />
      </QuestionScreen>
    );
  }

  // 3: Q3 motivation
  if (idx === 3) {
    const v = (answers.motivation as string) ?? "";
    return (
      <QuestionScreen
        eyebrow="Chapter 1 of 4 · Question 3 of 11"
        question="What's drawing you to this?"
        progressPct={p}
        canAdvance={v.trim().length > 0}
        onBack={goBack}
        onNext={() => advanceWithSave(["motivation"])}
        pending={pending}
      >
        <LongTextField
          value={v}
          onChange={(x) => setA({ motivation: x })}
          placeholder="What made you look at franchise ownership? Why this brand?"
          hint="3–5 sentences is plenty."
        />
      </QuestionScreen>
    );
  }

  // 4: Chapter 2 intro
  if (idx === 4) {
    return (
      <ChapterIntroScreen
        eyebrow="Chapter 2 of 4 · The money conversation"
        body="Alright — a few money questions coming up. We're not judging, and none of this automatically disqualifies you. It just helps us match you to the right territory."
        onContinue={() => setIdx(5)}
        progressPct={p}
      />
    );
  }

  // 5: Quick financial check (liquid capital + net worth + credit score chips)
  if (idx === 5) {
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

  // 6: Q7 bankruptcy
  if (idx === 6) {
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
        eyebrow="Chapter 2 of 4 · Question 7 of 11"
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

  // 7: Q8 opening timeline
  if (idx === 7) {
    const v = (answers.opening_timeline as string) ?? "";
    return (
      <QuestionScreen
        eyebrow="Chapter 3 of 4 · Question 8 of 11"
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

  // 8: Q9 involvement level
  if (idx === 8) {
    const v = (answers.involvement_level as string) ?? "";
    return (
      <QuestionScreen
        eyebrow="Chapter 3 of 4 · Question 9 of 11"
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

  // 9: Q10 growth plan
  if (idx === 9) {
    const v = (answers.growth_plan as string) ?? "";
    return (
      <QuestionScreen
        eyebrow="Chapter 3 of 4 · Question 10 of 11"
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

  // 10: Q11 discovery source (with "Other" text)
  if (idx === 10) {
    const v: SelectWithOtherValue = {
      value: (answers.discovery_source as string) ?? "",
      otherText: (answers.discovery_source_other as string) ?? "",
    };
    const canAdvance =
      v.value.length > 0 &&
      (v.value !== "other" || v.otherText.trim().length > 0);
    return (
      <QuestionScreen
        eyebrow="Chapter 4 of 4 · Question 11 of 11"
        question="How'd you find us?"
        progressPct={p}
        canAdvance={canAdvance}
        onBack={goBack}
        onNext={() =>
          advanceWithSave(["discovery_source", "discovery_source_other"])
        }
        pending={pending}
      >
        <SingleSelectWithOtherField
          value={v}
          onChange={(nv) =>
            setA({
              discovery_source: nv.value,
              discovery_source_other: nv.otherText,
            })
          }
          options={DISCOVERY_SOURCES}
        />
      </QuestionScreen>
    );
  }

  // 11: Sign-off
  if (idx === 11) {
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
