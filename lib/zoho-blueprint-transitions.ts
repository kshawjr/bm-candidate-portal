import "server-only";

import type { MilestoneEvent } from "@/lib/candidate-events";

export type BrandSlug = "hounds-town-usa" | "cruisin-tikis";

// Milestone → per-brand Zoho Blueprint transition IDs on the Lead
// module. Brand-keyed since opt-out (candidate_opted_out) diverges
// between HT and CT — the earlier flat map assumed both brands shared
// the same Blueprint, which is only true for the pre-opt-out
// transitions today. Adding a new transition is one entry here once
// Kevin has the IDs from Zoho → Setup → Process Management →
// Blueprints → Leads.
export const TRANSITION_ID_BY_MILESTONE_BY_BRAND: Partial<
  Record<MilestoneEvent, Record<BrandSlug, string>>
> = {
  brand_tour_engaged: {
    // TODO: confirm — assumed shared until Kevin verifies with Zoho.
    "hounds-town-usa": "5380286000093074144",
    "cruisin-tikis": "5380286000093074144",
  },
  discovery_scheduled: {
    // TODO: confirm — assumed shared until Kevin verifies with Zoho.
    "hounds-town-usa": "5380286000093074143",
    "cruisin-tikis": "5380286000093074143",
  },
  candidate_opted_out: {
    "hounds-town-usa": "5380286000083142492",
    "cruisin-tikis": "5380286000083174437",
  },
};

export function getTransitionId(
  milestone: MilestoneEvent,
  brandSlug: BrandSlug,
): string | undefined {
  return TRANSITION_ID_BY_MILESTONE_BY_BRAND[milestone]?.[brandSlug];
}
