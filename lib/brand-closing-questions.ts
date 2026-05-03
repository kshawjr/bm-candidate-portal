// Per-brand "one last thing" closing question for the Chapter 1 application.
// Replaces the old shared Builder/Leader/Hustler chip set so each brand can
// land on something that feels like them.
//
// Hardcoded for now; PR 37 ships this as a developer-edited map keyed by
// brand slug. A later PR should hoist this into the admin so growth leaders
// can rewrite their own closing without a code change.
//
// Falls back to a generic chip set when the slug doesn't match — keeps any
// new/future brand from ending up with no closing screen at all.

import type { ApplicationOption } from "./application-options";

export interface BrandClosingQuestion {
  /** Heading text on the screen. */
  question: string;
  /** Smaller helper line under the heading. */
  subCaption: string;
  /** Chip options. The "other" value is conventional and reveals a textarea. */
  options: ApplicationOption[];
}

const FALLBACK: BrandClosingQuestion = {
  question: "One last one — which word describes you best?",
  subCaption: "There's no wrong answer. We're just curious.",
  options: [
    { value: "builder", label: "Builder" },
    { value: "leader", label: "Leader" },
    { value: "hustler", label: "Hustler" },
    { value: "other", label: "Other" },
  ],
};

const BY_SLUG: Record<string, BrandClosingQuestion> = {
  "hounds-town-usa": {
    question: "One last one — are you a dog person?",
    subCaption: "There's no wrong answer.",
    options: [
      { value: "definitely", label: "Definitely 🐕" },
      { value: "yes_but_cats_too", label: "Yes, but cats too 🐈" },
      { value: "honestly_neither", label: "Honestly, neither" },
      { value: "other", label: "Other" },
    ],
  },
  "cruisin-tikis": {
    question: "One last one — beach or pool?",
    subCaption: "There's no wrong answer.",
    options: [
      { value: "beach", label: "Beach 🏖️" },
      { value: "pool", label: "Pool 🏊" },
      { value: "mountains", label: "Neither, give me the mountains" },
      { value: "other", label: "Other" },
    ],
  },
};

export function brandClosingQuestion(brandSlug: string): BrandClosingQuestion {
  return BY_SLUG[brandSlug] ?? FALLBACK;
}
