// Categories used in candidate_events.category. Kept narrow on purpose
// so admin dashboards can filter on a small enum rather than a free-text
// column.
export type EventCategory =
  | "milestone"
  | "engagement"
  | "form"
  | "page"
  | "action";

// Milestone events trigger Zoho sync. The order represents the canonical
// journey progression — Portal_Status in Zoho should advance through
// these in order, never regress.
export const MILESTONE_EVENTS = [
  "portal_first_visit",
  // Fires the first time a candidate advances past slide 1 of the
  // Chapter 1 / Stop 1 brand tour (i.e. they're now viewing slide 2).
  // Sits between portal_first_visit ("opened the link") and
  // education_completed ("watched the whole brand pitch") — the gap
  // between visit and engagement is a sales-team signal distinct from
  // a 5-second click-and-close.
  "brand_tour_engaged",
  "education_completed",
  "application_started",
  "application_submitted",
  "discovery_scheduled",
  "discovery_completed",
  "verify_started",
  "verify_completed",
  "award_offered",
  "award_accepted",
  // Off-funnel: candidate explicitly opted out from the portal footer.
  // Fires the Blueprint transition to "Not Interested" (brand-keyed)
  // and writes Reason_for_Loss. Does NOT update Portal_Status —
  // Blueprint owns funnel state for opt-outs.
  "candidate_opted_out",
  // Candidate clicked "Reconnect" on the opted-out screen. Creates a
  // Zoho Task assigned to the Lead Owner so the rep can reach out;
  // does not fire a Blueprint transition (rep decides next stage).
  "reengage_requested",
] as const;

export type MilestoneEvent = (typeof MILESTONE_EVENTS)[number];

// Map from milestone event → the Portal_Status string we set in Zoho.
// Keep in sync with the picklist values configured on the Zoho Leads
// module (see DEPLOYMENT.md). Partial: milestones without an entry
// (candidate_opted_out, reengage_requested) skip the Portal_Status
// write in the milestone sync because Blueprint owns funnel state for
// those off-funnel events.
export const ZOHO_STATUS_BY_MILESTONE: Partial<Record<MilestoneEvent, string>> = {
  portal_first_visit: "Portal Accessed",
  brand_tour_engaged: "Brand Tour Engaged",
  education_completed: "Education Complete",
  application_started: "Application Started",
  application_submitted: "Application Submitted",
  discovery_scheduled: "Discovery Scheduled",
  discovery_completed: "Discovery Completed",
  verify_started: "Verifying",
  verify_completed: "Verified",
  award_offered: "Offer Sent",
  award_accepted: "Awarded",
};

export function isMilestone(eventType: string): eventType is MilestoneEvent {
  return (MILESTONE_EVENTS as readonly string[]).includes(eventType);
}
