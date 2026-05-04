import "server-only";

import type { MilestoneEvent } from "@/lib/candidate-events";

// Maps milestone event types → their corresponding Zoho Blueprint
// transition IDs on the Lead module. Both brands share the same Lead
// Blueprint right now, so transitions aren't brand-specific.
//
// When Opportunities/Deals diverge across brands later, extend this map
// to a `Record<MilestoneEvent, Record<BrandSlug, TransitionId>>`.
export const TRANSITION_ID_BY_MILESTONE: Partial<
  Record<MilestoneEvent, string>
> = {
  education_completed: "5380286000093074144", // New → Engaged
  discovery_scheduled: "5380286000093074143", // Engaged → Discovery Call Booked
};

export function getTransitionIdForMilestone(
  eventType: MilestoneEvent,
): string | undefined {
  return TRANSITION_ID_BY_MILESTONE[eventType];
}
