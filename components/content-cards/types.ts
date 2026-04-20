// Shared types for the content-card surface (renders below step content).
// Each card's discriminator is `type`; sub-components read their own shape.

export interface FactCardData {
  type: "fact";
  headline: string;
  body: string;
  source?: string;
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
  items: Array<{ name: string; photo_url?: string; caption?: string }>;
}

export interface PhotoCardData {
  type: "photo";
  image_url: string;
  caption?: string;
}

export type ContentCard =
  | FactCardData
  | QuoteCardData
  | AwardsCardData
  | PersonasCardData
  | PhotoCardData;
