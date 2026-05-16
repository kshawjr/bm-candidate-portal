import "server-only";

import type { MilestoneEvent } from "@/lib/candidate-events";

// Maps milestone event types → their corresponding Zoho Blueprint
// transition IDs on the Lead module. Both brands share the same Lead
// Blueprint right now, so transitions aren't brand-specific.
//
// Partial map on purpose — only milestones with a known transition_id
// get wired. Unmapped milestones still record their event + fire the
// Portal_Status update; they just don't advance the Lead's Stage.
// Adding a new transition is one line here once Kevin has the ID from
// Zoho → Setup → Process Management → Blueprints → Leads.
//
// When Opportunities/Deals diverge across brands later, extend this map
// to a `Record<MilestoneEvent, Record<BrandSlug, TransitionId>>`.
export const TRANSITION_ID_BY_MILESTONE: Partial<
  Record<MilestoneEvent, string>
> = {
  // "Engaged" fires when the candidate first signals real engagement —
  // advancing past slide 1 of the brand tour (slide_viewed on idx 1
  // promoted to a milestone). PR's first transition. The earlier
  // version of this map keyed this transition ID on education_completed
  // (the "finished the whole brand pitch" milestone) which fired too
  // late — the candidate is well past New by then. Moving it to
  // brand_tour_engaged matches the sales-team intent of the New →
  // Engaged step.
  brand_tour_engaged: "5380286000093074144", // New → Engaged
  discovery_scheduled: "5380286000093074143", // Engaged → Discovery Call Booked
};

export function getTransitionIdForMilestone(
  eventType: MilestoneEvent,
): string | undefined {
  return TRANSITION_ID_BY_MILESTONE[eventType];
}
