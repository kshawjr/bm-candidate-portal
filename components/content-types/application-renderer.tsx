"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  ShortTextField,
  SingleSelectField,
  ChipGroupField,
  type SelectOption,
} from "@/components/application/fields";
import {
  SaveIndicator,
  type SaveState,
} from "@/components/portal/save-indicator";
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
import {
  MOTIVATIONS,
  OPENING_TIMELINE,
  OTHER_VALUE,
} from "@/lib/application-options";
import { brandClosingQuestion } from "@/lib/brand-closing-questions";

// ---------- Option sets ----------
//
// PR 37 added an "Other" chip to opening_timeline / involvement_level /
// growth_plan and routes its free-text into a dedicated *_other_text key.
// OPENING_TIMELINE + OTHER_VALUE moved to lib/application-options.ts
// so server code (log-event.ts → Zoho field writes) can import them
// without crossing a "use client" boundary.

const INVOLVEMENT_LEVELS: SelectOption[] = [
  {
    value: "owner_operator",
    label: "Owner-operator",
    desc: "I want to run this day to day",
  },
  {
    value: "semi_active",
    label: "Semi-active",
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
  /** Brand display name (bmave-core.brands.name). Threaded into the
   *  financial-intro copy so it reads "invest in your own {brand}
   *  location" rather than a generic placeholder. */
  brandName: string;
  /** Optional ZIP prefilled at candidate creation time. When set, the
   *  ZIP step skips the cold-input box and lands on the confirmation
   *  card. Null/empty → existing cold flow. */
  prefilledZip: string | null;
  /** PR 42: optional phone prefilled at candidate creation time. When set,
   *  the verification screen seeds the phone field with this value and
   *  shows a "Prefilled from your record" hint underneath. Null → falls
   *  back to bmave-core.candidates.phone (existing behavior). */
  prefilledPhone: string | null;
  initialAnswers: Answers;
  isAlreadySubmitted: boolean;
  onSaveAnswer: (fieldKey: string, fieldValue: unknown) => Promise<void>;
  onSubmit: (finalAnswers: Answers) => Promise<void>;
  onContinueToNextChapter: () => void;
}

// ---------- Screen indices ----------
//
// Section labels (PR 39) are the source of truth — see SECTION_BY_IDX
// below. Keep this comment aligned with that map.
//
//   0  verification                       (Section 1 of 7 · Personal info)
//   1  Q1  current_role                   (Section 1 of 7 · Personal info)
//   2  Q2  zip-location                   (Section 2 of 7 · Location)
//   3  Q3  motivation (multi)             (Section 3 of 7 · Motivation)
//   4  Q4  motivation elaboration         (Section 3 of 7 · Motivation)
//   5  Section 4 intro                    (Section 4 of 7 · Financial)
//   6  Q5  quick financial check          (Section 4 of 7 · Financial)
//   7  Q6  bankruptcy                     (Section 5 of 7 · Background)
//   8  Q7  felony                         (Section 5 of 7 · Background)
//   9  Q8  opening_timeline               (Section 6 of 7 · Practical)
//   10 Q9  involvement_level              (Section 6 of 7 · Practical)
//   11 Q10 growth_plan                    (Section 6 of 7 · Practical)
//   12 Q11 brand-specific closing         (Section 7 of 7 · Closing)
//   13 sign-off                           (Section 7 of 7 · Closing)
//   14 success
const SUCCESS_IDX = 14;
const LAST_INTERACTIVE_IDX = 13;
const TOTAL_QUESTIONS = 11;

function progressFor(idx: number): number {
  if (idx >= SUCCESS_IDX) return 100;
  return Math.round((idx / LAST_INTERACTIVE_IDX) * 100);
}

// ---------- Section grouping (PR 39) ----------
//
// The 14 screens cluster into 7 logical sections. The section pill, the
// inter-section microcopy, and the decreasing time estimate all read off
// this map. Edits here flow to all three.

interface SectionDef {
  /** 1-indexed section number for display ("Section X of 7"). */
  num: number;
  /** Title shown nowhere right now but useful for future labels. */
  title: string;
  /** Microcopy that fades in briefly the first time the candidate
   *  advances OUT of this section. */
  doneCopy: string;
}

const SECTION_BY_IDX: Record<number, SectionDef> = {
  // Section 1 — Personal info (verification + current_role)
  0: { num: 1, title: "Personal", doneCopy: "Got the basics." },
  1: { num: 1, title: "Personal", doneCopy: "Got the basics." },
  // Section 2 — Location
  2: { num: 2, title: "Location", doneCopy: "Locked in." },
  // Section 3 — Motivation (chips + elaboration)
  3: { num: 3, title: "Motivation", doneCopy: "Got it." },
  4: { num: 3, title: "Motivation", doneCopy: "Got it." },
  // Section 4 — Financial (intro + the chip screen)
  5: {
    num: 4,
    title: "Financial",
    doneCopy: "Nice — now the easy part.",
  },
  6: {
    num: 4,
    title: "Financial",
    doneCopy: "Nice — now the easy part.",
  },
  // Section 5 — Background check
  7: { num: 5, title: "Background", doneCopy: "Halfway through. Hang with us." },
  8: { num: 5, title: "Background", doneCopy: "Halfway through. Hang with us." },
  // Section 6 — Practical (timing / hands-on / growth)
  9: { num: 6, title: "Practical", doneCopy: "Almost done." },
  10: { num: 6, title: "Practical", doneCopy: "Almost done." },
  11: { num: 6, title: "Practical", doneCopy: "Almost done." },
  // Section 7 — Closing (brand question + sign-off)
  12: { num: 7, title: "Closing", doneCopy: "" },
  13: { num: 7, title: "Closing", doneCopy: "" },
};
const SECTION_TOTAL = 7;

// PR 112 (Ashly app review): drop the per-section decreasing estimate
// in favor of a single "Less than 5 minutes" cap. Confident, doesn't
// ramble, and matches the framing on the journey card. Keyed map kept
// (vs. a single constant) only so the consumer at app-meta-time
// doesn't need to change.
const TIME_LEFT_BY_SECTIONS_DONE: Record<number, string> = {
  0: "Less than 5 minutes",
  1: "Less than 5 minutes",
  2: "Less than 5 minutes",
  3: "Less than 5 minutes",
  4: "Less than 5 minutes",
  5: "Less than 5 minutes",
  6: "Less than 5 minutes",
};

function sectionForIdx(idx: number): SectionDef {
  return SECTION_BY_IDX[idx] ?? { num: 7, title: "Closing", doneCopy: "" };
}

// Derive a question-screen eyebrow from SECTION_BY_IDX — single source
// of truth. Format: "<SectionTitle> · Question <N> of <TOTAL>". Drops
// the legacy "X of 4" framing entirely — the application's section
// count is 7, not 4, and the old inner-section label collided
// vocabulary-wise with the outer journey concept.
function questionEyebrow(idx: number, questionNumber: number): string {
  const section = SECTION_BY_IDX[idx] ?? SECTION_BY_IDX[0];
  return `${section.title} · Question ${questionNumber} of ${TOTAL_QUESTIONS}`;
}

// Per-idx canonical answer-key list, used by computeInitialIdx() to
// resume a returning candidate at the first incomplete screen. Keys
// match what advanceWithSave() persists when leaving each idx — keep
// them in sync if either changes. Idx 4 (motivation elaboration) and
// idx 5 (chapter 2 intro) are intentionally absent: elaboration is
// conditional on the motivation answer, and chapter intros have no
// answer to gate on. Idx 13 (sign-off) is omitted on purpose so resume
// never auto-advances past the submit moment.
const RESUME_KEYS_BY_IDX: Record<number, string[]> = {
  0: ["verified_name", "verified_email", "verified_phone"],
  1: ["current_role"],
  2: ["zip_code"],
  3: ["motivation"],
  6: ["liquid_capital_range"],
  7: ["has_filed_bankruptcy"],
  8: ["has_felony"],
  9: ["opening_timeline"],
  10: ["involvement_level"],
  11: ["growth_plan"],
  12: ["brand_closing_response"],
};

function isAnswerComplete(answers: Answers, key: string): boolean {
  const v = answers[key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return true;
  if (typeof v === "number") return true;
  return false;
}

/**
 * Compute the screen idx a returning candidate should land on. Walks the
 * sequence and returns the first idx whose required answers aren't all
 * present. Idx 0 (verification) is always shown if any of the three
 * verification fields is missing — name/email/phone re-confirmation on
 * resume is intentional. Submitted candidates skip past this entirely
 * (handled at the call site via isAlreadySubmitted).
 *
 * Best-effort. If the table here drifts from the actual save keys, the
 * candidate sees a question they already answered — annoying, not
 * data-losing, since their previous answer pre-populates the field.
 *
 * (This is the only piece kept from the closed PR #76 — it was the only
 *  behavioral improvement worth saving from that direction.)
 */
function computeInitialIdx(answers: Answers): number {
  for (let idx = 0; idx <= LAST_INTERACTIVE_IDX; idx++) {
    const keys = RESUME_KEYS_BY_IDX[idx];
    if (!keys || keys.length === 0) continue;
    const allDone = keys.every((k) => isAnswerComplete(answers, k));
    if (!allDone) return idx;
  }
  return LAST_INTERACTIVE_IDX;
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
  brandName,
  prefilledZip,
  prefilledPhone,
  initialAnswers,
  isAlreadySubmitted,
  onSaveAnswer,
  onSubmit,
  onContinueToNextChapter,
}: Props) {
  const fullName = [candidate.first_name, candidate.last_name]
    .filter(Boolean)
    .join(" ");
  // PR 42: prefer the per-portal prefilled_phone over bmave-core's
  // candidate.phone. The per-portal value is what the Zoho lead webhook
  // will populate for the candidate's intake; bmave-core.phone may lag
  // until the candidate explicitly confirms.
  const initialPhone = (prefilledPhone ?? candidate.phone ?? "").toString();
  // Track whether the phone field landed pre-populated so the verification
  // screen can show "Prefilled from your record" — works whether the
  // value came from prefilled_phone or bmave-core.candidates.phone.
  const phoneIsPrefilled = initialPhone.trim().length > 0;
  const [answers, setAnswers] = useState<Answers>(() => ({
    verified_name: fullName,
    verified_email: candidate.email,
    verified_phone: initialPhone,
    ...initialAnswers,
  }));

  // Resume a returning candidate at the first incomplete screen instead
  // of restarting at verification every visit. Already-submitted
  // candidates still skip straight to success (existing behavior).
  const [idx, setIdx] = useState(() => {
    if (isAlreadySubmitted) return SUCCESS_IDX;
    return computeInitialIdx({
      verified_name: fullName,
      verified_email: candidate.email,
      verified_phone: initialPhone,
      ...initialAnswers,
    });
  });

  const [pending, startTransition] = useTransition();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // PR 39: microcopy that fades in once when the candidate advances out of
  // a section. Cleared by a timeout so it doesn't linger.
  const [doneCopy, setDoneCopy] = useState<string | null>(null);

  // A3 + A9 (subtle animations): when section.num changes, run two
  // simultaneous pill effects:
  //   - is-updating: 200ms opacity dim (subtle "value just updated").
  //   - is-completing: 1300ms success-color flash + check icon scale-in
  //     (acknowledges that a section was just finished — the pill itself
  //     is the celebration, no overlay).
  const currentSectionNum = sectionForIdx(idx).num;
  const prevSectionNum = useRef(currentSectionNum);
  const [sectionPillUpdating, setSectionPillUpdating] = useState(false);
  const [sectionPillCompleting, setSectionPillCompleting] = useState(false);
  useEffect(() => {
    if (prevSectionNum.current === currentSectionNum) return;
    prevSectionNum.current = currentSectionNum;
    setSectionPillUpdating(true);
    setSectionPillCompleting(true);
    const tDim = window.setTimeout(() => setSectionPillUpdating(false), 200);
    const tFlash = window.setTimeout(
      () => setSectionPillCompleting(false),
      1300,
    );
    return () => {
      window.clearTimeout(tDim);
      window.clearTimeout(tFlash);
    };
  }, [currentSectionNum]);

  const setA = (patch: Answers) =>
    setAnswers((prev) => ({ ...prev, ...patch }));

  const advanceWithSave = (keys: string[]) => {
    startTransition(async () => {
      setSaveState("saving");
      try {
        for (const k of keys) {
          await onSaveAnswer(k, answers[k]);
        }
        setSaveState("saved");
      } catch {
        setSaveState("error");
        return;
      }
      // Trigger inter-section microcopy when the advance crosses a section
      // boundary. Done before advancing idx so the copy reads "you finished
      // section X" before the next section's pill ticks over.
      const fromSection = sectionForIdx(idx).num;
      const toSection = sectionForIdx(idx + 1).num;
      if (toSection !== fromSection) {
        const copy = sectionForIdx(idx).doneCopy;
        if (copy) {
          setDoneCopy(copy);
          window.setTimeout(() => setDoneCopy(null), 2800);
        }
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
      setSaveState("saving");
      try {
        await onSubmit(finalAnswers);
        setSaveState("saved");
      } catch {
        setSaveState("error");
        return;
      }
      setAnswers(finalAnswers);
      setIdx(SUCCESS_IDX);
    });
  };

  const p = progressFor(idx);
  const closingQ = brandClosingQuestion(brandSlug);

  // ---- Screen rendering ----
  //
  // PR 39 wraps the dispatch in a function so the SaveIndicator + section
  // pill + estimated time + microcopy can all sit alongside whichever screen
  // the candidate is on, without each `if (idx === N)` branch having to
  // include its own copy of the wrapping cluster.

  const pickScreen = (): ReactNode => {

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
        phoneIsPrefilled={phoneIsPrefilled}
      />
    );
  }

  // 1: Q1 current_role
  if (idx === 1) {
    const v = (answers.current_role as string) ?? "";
    return (
      <QuestionScreen
        eyebrow={questionEyebrow(1, 1)}
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
        eyebrow={questionEyebrow(2, 2)}
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
        eyebrow={questionEyebrow(3, 3)}
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
        eyebrow={questionEyebrow(4, 4)}
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

  // 5: Section 4 intro (Money — financial check)
  if (idx === 5) {
    return (
      <ChapterIntroScreen
        eyebrow="Money · The numbers conversation"
        body="Next up — a quick financial check. None of this automatically disqualifies you. It just helps us match you to the right territory."
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
        eyebrow={questionEyebrow(6, 5)}
        brandName={brandName}
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
        eyebrow={questionEyebrow(7, 6)}
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
        eyebrow={questionEyebrow(8, 7)}
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
        eyebrow={questionEyebrow(9, 8)}
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
        eyebrow={questionEyebrow(10, 9)}
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
        eyebrow={questionEyebrow(11, 10)}
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
        eyebrow={questionEyebrow(12, 11)}
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
  // already-submitted candidates returning to the application step.
  return (
    <SuccessScreen
      firstName={candidate.first_name}
      onContinue={onContinueToNextChapter}
    />
  );
  };

  // ---- Wrapping cluster ----
  // Save state, section pill, time estimate, and inter-section microcopy
  // ride above whichever screen the candidate is on. Hidden once the
  // candidate is past the form (success screen).
  const section = sectionForIdx(idx);
  const sectionsCompletedLeftOfCurrent = Math.max(0, section.num - 1);
  const timeLeftLabel =
    TIME_LEFT_BY_SECTIONS_DONE[sectionsCompletedLeftOfCurrent] ?? null;
  const onForm = idx < SUCCESS_IDX;

  return (
    <div className="app-renderer-wrap">
      {onForm && (
        <div className="app-meta-cluster" aria-live="polite">
          {timeLeftLabel && (
            <span className="app-meta-time">{timeLeftLabel}</span>
          )}
          <span
            className={`app-meta-section${sectionPillUpdating ? " is-updating" : ""}${sectionPillCompleting ? " is-completing" : ""}`}
          >
            Section {section.num} of {SECTION_TOTAL}
            <span className="section-check" aria-hidden="true">
              ✓
            </span>
          </span>
          <SaveIndicator state={saveState} />
        </div>
      )}
      {/* A1: keyed wrapper makes React remount the screen subtree on
          every idx change. The CSS animation on .app-screen-host runs
          on each fresh mount, giving a 200ms opacity fade-in. */}
      <div key={idx} className="app-screen-host">
        {pickScreen()}
      </div>
      {doneCopy && (
        <div className="app-section-microcopy" role="status">
          {doneCopy}
        </div>
      )}
    </div>
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
