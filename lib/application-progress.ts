/**
 * Application progress tracking for Zoho writeback.
 *
 * Each forward advance through the application questions writes three
 * fields on the candidate's Zoho Lead:
 *   - Application_Complete_Percent (Number, 0-100)
 *   - Application_Last_Question (Picklist, see APPLICATION_QUESTION_LABELS)
 *   - Application_Last_Activity (DateTime, ISO 8601 with +00:00 offset)
 *
 * Powers dropoff analysis — sales / product can see exactly where
 * candidates stall and segment for outreach. Reports possible:
 *   - dropoff funnel by last question
 *   - stalled list (1-99% + last activity > 48h ago)
 *   - time-to-completion (lead created → 100%)
 */

// The 11 application question slots. Order + spelling MUST match the
// picklist values configured on the Zoho Application_Last_Question
// field — Zoho silently rejects unknown values.
export const APPLICATION_QUESTION_LABELS: readonly string[] = [
  "Q1 — Personal info",
  "Q2 — Role/employment",
  "Q3 — Location",
  "Q4 — Motivation",
  "Q5 — Motivation elaboration",
  "Q6 — Financial check",
  "Q7 — Bankruptcy",
  "Q8 — Felony",
  "Q9 — Opening timeline",
  "Q10 — Portfolio scope",
  "Q11 — Growth plan",
] as const;

export const TOTAL_APPLICATION_QUESTIONS = APPLICATION_QUESTION_LABELS.length;

// Application screen idx → 0-indexed question position (or null for
// non-question transitional screens). Source-of-truth: the screen-
// index comment block at the top of application-renderer.tsx — keep
// in sync when adding / removing screens. Null entries (verification
// transitional screen the user-spec didn't count as a question, idx 5
// chapter intro card) skip the Zoho write entirely; the candidate's
// "last question" stays at whatever they previously reached.
//
// idx 12 (brand-specific closing) and idx 13 (sign-off) both map to
// the Q11 slot — they're not new questions, they're chrome around
// the last one. idx 14 (success screen) bumps to the "Completed"
// sentinel (handled by getApplicationQuestionLabel when questionIdx
// >= TOTAL_APPLICATION_QUESTIONS).
const SCREEN_IDX_TO_QUESTION_IDX: ReadonlyArray<number | null> = [
  0, // 0: verification → Q1
  1, // 1: current_role → Q2
  2, // 2: zip-location → Q3
  3, // 3: motivation chips → Q4
  4, // 4: motivation elaboration → Q5
  null, // 5: chapter 2 intro (transitional)
  5, // 6: financial check → Q6
  6, // 7: bankruptcy → Q7
  7, // 8: felony → Q8
  8, // 9: opening timeline → Q9
  9, // 10: involvement → Q10
  10, // 11: growth plan → Q11
  10, // 12: brand-specific closing (still Q11 slot)
  10, // 13: sign-off (still Q11 slot — submit hasn't fired yet)
  11, // 14: success (past last, → "Completed")
];

/**
 * Map an application screen idx to the 0-indexed question position
 * used by getApplicationQuestionLabel / getApplicationCompletePercent.
 * Returns null for transitional non-question screens.
 */
export function screenIdxToQuestionIdx(screenIdx: number): number | null {
  if (screenIdx < 0) return null;
  const mapped = SCREEN_IDX_TO_QUESTION_IDX[screenIdx];
  if (mapped === undefined) {
    // Past the end of the table — treat as Completed.
    return TOTAL_APPLICATION_QUESTIONS;
  }
  return mapped;
}

/**
 * Convert a 0-indexed question position to a Zoho picklist value.
 * Returns "Completed" for any index >= total (i.e., past Q11).
 */
export function getApplicationQuestionLabel(questionIdx: number): string {
  if (questionIdx >= TOTAL_APPLICATION_QUESTIONS) return "Completed";
  return (
    APPLICATION_QUESTION_LABELS[questionIdx] ?? APPLICATION_QUESTION_LABELS[0]
  );
}

/**
 * Convert a 0-indexed question position to completion percentage.
 * Q1 reached (idx 0) = round(1/11) = 9%; Q11 reached (idx 10) = 100%.
 * Past-Q11 (Completed) also returns 100.
 */
export function getApplicationCompletePercent(questionIdx: number): number {
  if (questionIdx >= TOTAL_APPLICATION_QUESTIONS) return 100;
  return Math.round(
    ((questionIdx + 1) / TOTAL_APPLICATION_QUESTIONS) * 100,
  );
}

/**
 * Format a Date as ISO 8601 with explicit +00:00 offset (UTC). Zoho
 * DateTime fields reject the Z-suffix in some contexts; the explicit
 * offset is mandatory per earlier CQ_Received writeback debugging.
 *
 * Mirrors the private helper in lib/log-event.ts. Duplicated here to
 * keep the application-progress helpers self-contained; a future
 * cleanup PR can extract both to a shared lib/zoho-format.ts.
 */
export function formatZohoDateTime(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19) + "+00:00";
}
