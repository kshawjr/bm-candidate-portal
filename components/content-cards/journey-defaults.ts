// Default copy for the 8 stops on the Journey Roadmap card. Used by
// the renderer's hardcoded fallback (when a card hasn't been migrated
// or edited yet), by the admin form's pre-fill, and mirrored verbatim
// in the seed migration SQL. Non-client module so server code can
// import safely.

export interface JourneyStopDefault {
  title: string;
  caption: string;
}

export const JOURNEY_STOP_COUNT = 8;

export const DEFAULT_JOURNEY_STOPS: readonly [
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
  JourneyStopDefault,
] = [
  {
    title: "Questionnaire",
    caption: "Five minutes. Confirms market availability and financial fit.",
  },
  {
    title: "Discovery Call",
    caption:
      "Two-way conversation. Your goals, our opportunity. Clear expectations set.",
  },
  {
    title: "Investment & Unit Economics",
    caption:
      "Full financial breakdown. FDD sent. Budget tool provided. Numbers on the table.",
  },
  {
    title: "FDD Exploration",
    caption:
      "Walk through key FDD items. Financial verification. Territory discussion.",
  },
  {
    title: "Due Diligence",
    caption: "Territory confirmed. Validation calls with current franchisees.",
  },
  {
    title: "Visionary Call",
    caption: "Direct conversation with Co-CEOs. Vision and future explored.",
  },
  {
    title: "Confirmation Day",
    caption: "Meet the full support team. Final mutual alignment.",
  },
  {
    title: "Signing Day & Award",
    caption:
      "Agreement executed. Onboarding begins. Your territory is secured.",
  },
];
