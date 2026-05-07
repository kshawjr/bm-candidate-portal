// Canonical step contracts. The candidate-portal renderer dispatches by
// (chapter_key, step_key, content_type) and assumes specific combinations
// are stable forever — Stop 1's brand tour is always slides, Stop 1's
// light application is always content_type='application', etc. The admin
// "Update step" flow used to allow free editing of content_type on these
// rows; PR #72 patched application drift on production after that
// loophole produced a confusing render bug. This module locks the
// contracts down so the same class of drift can't recur.
//
// Source of truth: scripts/seed.ts CHAPTER_STEPS. If you edit one, you
// must edit the other. Keep them in sync.
//
// Non-canonical (admin-added custom) steps are NOT in this list and stay
// fully editable — only the canonical contract is locked.

export interface CanonicalStepContract {
  chapter_key: string;
  step_key: string;
  content_type: string;
  display_label: string;
}

export const CANONICAL_STEPS: CanonicalStepContract[] = [
  // Chapter 1 — Explore
  { chapter_key: "explore", step_key: "tour", content_type: "slides", display_label: "Brand tour" },
  { chapter_key: "explore", step_key: "app", content_type: "application", display_label: "Light application" },

  // Chapter 2 — First chat (collapsed to a single step in PR #38)
  { chapter_key: "first_chat", step_key: "book", content_type: "schedule", display_label: "Book your call" },

  // Chapter 4 — Playbook (the FDD primer + reader + questions)
  { chapter_key: "playbook", step_key: "intro", content_type: "static", display_label: "How to read the FDD" },
  { chapter_key: "playbook", step_key: "document", content_type: "document", display_label: "The FDD" },
  { chapter_key: "playbook", step_key: "questions", content_type: "checklist", display_label: "Your questions" },

  // Chapter 5 — Verify
  { chapter_key: "verify", step_key: "background", content_type: "checklist", display_label: "Background check" },
  { chapter_key: "verify", step_key: "financial", content_type: "checklist", display_label: "Financial review" },
  { chapter_key: "verify", step_key: "validation", content_type: "static", display_label: "Validation calls" },

  // Chapter 6 — Visit
  { chapter_key: "visit", step_key: "invite", content_type: "static", display_label: "Your invitation" },
  { chapter_key: "visit", step_key: "travel", content_type: "static", display_label: "Travel + stay" },
  { chapter_key: "visit", step_key: "agenda", content_type: "static", display_label: "The agenda" },

  // Chapter 7 — Award
  { chapter_key: "award", step_key: "review", content_type: "document", display_label: "Review the agreement" },
  { chapter_key: "award", step_key: "sign", content_type: "static", display_label: "Sign" },
  { chapter_key: "award", step_key: "welcome", content_type: "static", display_label: "Welcome!" },
];

export function isCanonicalStep(
  chapterKey: string,
  stepKey: string,
): boolean {
  return CANONICAL_STEPS.some(
    (s) => s.chapter_key === chapterKey && s.step_key === stepKey,
  );
}

export function canonicalContractFor(
  chapterKey: string,
  stepKey: string,
): CanonicalStepContract | null {
  return (
    CANONICAL_STEPS.find(
      (s) => s.chapter_key === chapterKey && s.step_key === stepKey,
    ) ?? null
  );
}
