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
  welcome_video_completed: {
    // Fires the New → Engaged transition when the candidate dismisses
    // the Chapter 1 welcome video popup. History: originally wired to
    // brand_tour_engaged (advance past slide 1), then moved to
    // portal_first_visit in PR #143 ("opened the link at all"), now
    // moved here so "Engaged" means they got through the welcome video
    // rather than merely loading the page. portal_first_visit has no
    // transition and records blueprint_transition_status = 'skipped'.
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
