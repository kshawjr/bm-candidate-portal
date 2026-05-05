// Shared types for the content-card surface (renders below step content).
// Each card's discriminator is `type`; sub-components read their own shape.
//
// Every card supports an optional `title` field — admin-editable per card.
// When set and non-empty, the renderer uses it in place of the type's
// hardcoded section label (or shows it as a new label above the card for
// types that didn't have one before). Blank/null falls back to the
// per-type default. See DEFAULT_CARD_TITLES below.

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

// Marker card — the journey-ahead roadmap renders automatically from
// brand + candidate context, so no per-instance config. Existing once per
// brand on the explore tour step. Hidden from the "Add card" picker.
export interface JourneyAheadCardData {
  type: "journey_ahead";
  title?: string;
}

export type ContentCard =
  | FactCardData
  | QuoteCardData
  | AwardsCardData
  | PersonasCardData
  | PhotoCardData
  | JourneyAheadCardData;

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
