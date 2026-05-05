// Shared types for the content-card surface (renders below step content).
// Each card's discriminator is `type`; sub-components read their own shape.

export interface FactCardData {
  type: "fact";
  headline: string;
  body: string;
  source?: string;
  image_url?: string;
}

export interface QuoteCardData {
  type: "quote";
  author: string;
  role: string;
  body: string;
  photo_url?: string;
}

export interface AwardsCardData {
  type: "awards";
  items: Array<{ name: string; year?: string; logo_url?: string }>;
}

export interface PersonasCardData {
  type: "personas";
  items: Array<{ name?: string; photo_url?: string; caption?: string }>;
}

export interface PhotoCardData {
  type: "photo";
  image_url: string;
  caption?: string;
}

// Marker card — the journey-ahead roadmap renders automatically from
// brand + candidate context, so no per-instance config. Existing once per
// brand on the explore tour step. Hidden from the "Add card" picker.
export interface JourneyAheadCardData {
  type: "journey_ahead";
}

export type ContentCard =
  | FactCardData
  | QuoteCardData
  | AwardsCardData
  | PersonasCardData
  | PhotoCardData
  | JourneyAheadCardData;
