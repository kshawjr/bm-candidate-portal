import type { CardGating } from "@/components/content-cards/types";

// Pure card-visibility resolution. Runs on every render of the card
// strip, once per card. Stateless on purpose so the same logic is
// usable from the admin preview (synthetic unlocks) and from the
// candidate portal (live unlocks via useCandidateUnlocks).

export type CardVisibility =
  | { state: "visible" }
  | { state: "hidden" }
  | { state: "locked_teaser"; teaser_text: string };

const DEFAULT_TEASER_TEXT = "Unlocks soon";

/**
 * Decide whether a card should render, hide, or fall back to its
 * locked-teaser placeholder.
 *
 * Resolution order:
 *   1. No `unlock_key`               → visible (legacy / always-on cards)
 *   2. Candidate has the key         → visible
 *   3. show_locked_teaser is true    → locked_teaser with teaser_text
 *   4. show_locked_teaser is falsey  → hidden
 */
export function getCardVisibility(
  card: CardGating,
  unlockedKeys: string[],
): CardVisibility {
  if (!card.unlock_key) {
    return { state: "visible" };
  }
  if (unlockedKeys.includes(card.unlock_key)) {
    return { state: "visible" };
  }
  if (card.show_locked_teaser) {
    return {
      state: "locked_teaser",
      teaser_text: card.locked_teaser_text?.trim() || DEFAULT_TEASER_TEXT,
    };
  }
  return { state: "hidden" };
}
