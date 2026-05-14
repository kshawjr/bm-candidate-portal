// Shared types for the content-card surface (renders below step content).
// Each card's discriminator is `type`; sub-components read their own shape.
//
// Every card supports an optional `title` field — admin-editable per card.
// When set and non-empty, the renderer uses it in place of the type's
// hardcoded section label (or shows it as a new label above the card for
// types that didn't have one before). Blank/null falls back to the
// per-type default. See DEFAULT_CARD_TITLES below.
//
// Every card also supports optional unlock-gating fields (PR for content
// card unlock gating). When `unlock_key` is set, the card only renders
// for candidates whose unlocked_keys array contains that key. By default
// a locked card is hidden entirely; setting `show_locked_teaser: true`
// renders a placeholder LockedTeaserCard with `locked_teaser_text` (or
// "Unlocks soon" if absent) instead. See lib/card-visibility.ts for the
// resolution logic.

import type { UnlockKey } from "@/lib/unlock-keys";

/** Optional fields applied to every card variant via intersection. */
export interface CardGating {
  unlock_key?: UnlockKey;
  show_locked_teaser?: boolean;
  locked_teaser_text?: string;
}

export interface FactCardData {
  type: "fact";
  title?: string;
  headline: string;
  body: string;
  source?: string;
  image_url?: string;
}

export interface QuoteCardData {
  type: "quote";
  title?: string;
  author: string;
  role: string;
  body: string;
  photo_url?: string;
}

export interface AwardsCardData {
  type: "awards";
  title?: string;
  items: Array<{ name: string; year?: string; logo_url?: string }>;
}

export interface PersonasCardData {
  type: "personas";
  title?: string;
  items: Array<{ name?: string; photo_url?: string; caption?: string }>;
}

export interface PhotoCardData {
  type: "photo";
  title?: string;
  image_url: string;
  caption?: string;
}

export interface JourneyStop {
  title: string;
  caption: string;
}

// The journey-ahead roadmap renders the 8-stage scenery automatically
// from brand + candidate context. Per-card configurable surface:
//   - title:  section heading above the road (defaults to "Your journey ahead")
//   - caption: line of copy below the title (defaults to current hardcoded sub)
//   - background_image_url: optional 30%-opacity backdrop (per-card, not per-brand)
//   - stops: per-pin title + caption, tuple of 8. Renderer falls back to
//     DEFAULT_JOURNEY_STOPS when this field is missing (legacy cards
//     that pre-date this PR — seed migration backfills them).
export interface JourneyAheadCardData {
  type: "journey_ahead";
  title?: string;
  caption?: string | null;
  background_image_url?: string | null;
  /** Background image opacity as a 0–100 integer. Null/undefined →
   *  renderer defaults to 30 (matches the previous hardcoded value),
   *  so legacy cards keep rendering at 30% without a migration. */
  background_image_opacity?: number | null;
  stops?: [
    JourneyStop,
    JourneyStop,
    JourneyStop,
    JourneyStop,
    JourneyStop,
    JourneyStop,
    JourneyStop,
    JourneyStop,
  ];
}

// Intersection with CardGating means TS narrowing on `card.type` still
// works (each variant remains distinguishable by its `type` discriminator),
// but all variants get the three optional gating fields without per-variant
// declarations.
export type ContentCard = (
  | FactCardData
  | QuoteCardData
  | AwardsCardData
  | PersonasCardData
  | PhotoCardData
  | JourneyAheadCardData
) &
  CardGating;

/**
 * Per-type default labels. Awards, personas, and journey_ahead each show
 * a section label today; the renderer pulls the configured `title` first
 * and falls back to the corresponding default below. Fact, quote, and
 * photo cards have no default — `null` means "no label rendered" — but
 * admins can still set a title to introduce one.
 */
export const DEFAULT_CARD_TITLES: Record<ContentCard["type"], string | null> = {
  fact: null,
  quote: null,
  photo: null,
  awards: "Recognition",
  personas: "Who they serve",
  journey_ahead: "Your journey ahead",
};

/**
 * Resolve the title to render for a card: configured value when non-empty,
 * the per-type default otherwise. Returning null means the renderer
 * shouldn't render a section label at all.
 */
export function resolveCardTitle(card: ContentCard): string | null {
  const configured = card.title?.trim();
  if (configured) return configured;
  return DEFAULT_CARD_TITLES[card.type];
}
