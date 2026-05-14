// Single source of truth for the unlock-key vocabulary shared between
// Zoho's Portal_Unlocks multi-select picklist, the webhook that mirrors
// it, the waiting renderer that reads it, and the admin editor that
// references it. Add a new constant here when a new chapter goes behind
// a gate — then update Zoho's picklist values to match exactly (the
// webhook filters anything unrecognized via isValidUnlockKey).
//
// Naming convention: each key describes WHAT GETS UNLOCKED. So
// `webinar_unlocked` means the webinar chapter is now accessible, not
// that the webinar has been completed.

export const UNLOCK_KEYS = {
  DISCOVERY_CALL: "discovery_call_unlocked",
  WEBINAR: "webinar_unlocked",
  FDD: "fdd_unlocked",
  VERIFICATION: "verification_unlocked",
  DISCOVERY_DAY: "discovery_day_unlocked",
  AWARD: "award_unlocked",
} as const;

export type UnlockKey = (typeof UNLOCK_KEYS)[keyof typeof UNLOCK_KEYS];

// Display-label ordering follows the journey order so the admin
// dropdown reads top-to-bottom in the same sequence candidates
// experience the gated chapters.
export const UNLOCK_KEY_OPTIONS: ReadonlyArray<{
  value: UnlockKey;
  label: string;
}> = [
  { value: "discovery_call_unlocked", label: "Discovery Call (Chapter 2)" },
  { value: "webinar_unlocked", label: "Webinar (Chapter 3)" },
  { value: "fdd_unlocked", label: "FDD (Chapter 4)" },
  { value: "verification_unlocked", label: "Verification (Chapter 5)" },
  { value: "discovery_day_unlocked", label: "Discovery Day (Chapter 6)" },
  { value: "award_unlocked", label: "Award (Chapter 7)" },
];

export function isValidUnlockKey(key: unknown): key is UnlockKey {
  return (
    typeof key === "string" &&
    (Object.values(UNLOCK_KEYS) as string[]).includes(key)
  );
}
