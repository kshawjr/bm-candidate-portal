// Forward-only rules for the Zoho Lead field `FranFunnel_Stage`
// (label "Portal Stage", single-select picklist). Pure — no network,
// no Supabase — so the decision can be unit-tested directly. The Zoho
// read + write that uses it lives in lib/log-event.ts.

import type { MilestoneEvent } from "@/lib/candidate-events";

// Milestone → FranFunnel_Stage value. Strings must match the live Zoho
// picklist exactly; Zoho rejects unknown picklist values.
export const PORTAL_STAGE_BY_MILESTONE: Partial<Record<MilestoneEvent, string>> =
  {
    portal_first_visit: "Access Portal",
    education_completed: "Watch Overview",
    application_submitted: "Complete Questionnaire",
    discovery_scheduled: "Confirmed Discovery",
  };

// Full picklist order, earliest → latest. The portal never writes
// "New Lead", "New MQL" or "Discovery Call No Show" (Zoho sets those),
// but they stay here so forward-only comparisons know where they sit.
export const PORTAL_STAGE_ORDER = [
  "New Lead",
  "New MQL",
  "Access Portal",
  "Watch Overview",
  "Complete Questionnaire",
  "Confirmed Discovery",
  "Discovery Call No Show",
] as const;

export const CONFIRMED_DISCOVERY = "Confirmed Discovery";
export const DISCOVERY_NO_SHOW_STAGE = "Discovery Call No Show";

// Old value the portal used to write for discovery_scheduled. Treated
// as the same rank as "Confirmed Discovery".
export const LEGACY_CONFIRMED_DISCOVERY = "Discovery Call Scheduled";

// Lead_Status value that marks a no-show candidate who may rebook.
// Exact spelling still being confirmed with the Zoho admin — change it
// here only.
export const LEAD_STATUS_NO_SHOW_ATC = "Discovery Call No Show ATC";

/**
 * Rank of a FranFunnel_Stage value in PORTAL_STAGE_ORDER.
 *
 * Returns -1 for a blank value or any value not in the order list, so
 * it ranks earlier than "Access Portal" and the portal writes over it.
 * Known legacy picklist values this deliberately covers:
 *   "-None-", "New", "New - Not Active", "New - Legacy",
 *   "Engaged - Business Overview", "Engaged - Business Overview Complete",
 *   "Engaged - Application Started", "Engaged - Needs Scheduling",
 *   "Schedule Discovery", "Reschedule Discovery".
 */
export function portalStageRank(value: string | null | undefined): number {
  if (typeof value !== "string") return -1;
  const v = value.trim();
  if (v === LEGACY_CONFIRMED_DISCOVERY) {
    return PORTAL_STAGE_ORDER.indexOf(CONFIRMED_DISCOVERY);
  }
  return (PORTAL_STAGE_ORDER as readonly string[]).indexOf(v);
}

/**
 * Decide whether the portal should write `newStage` to FranFunnel_Stage.
 *
 * - Writes only when `newStage` is later in PORTAL_STAGE_ORDER than the
 *   current value. Same value or earlier → no write.
 * - Rebook exception: "Confirmed Discovery" may overwrite a later value
 *   when the current stage is "Discovery Call No Show" OR the Lead_Status
 *   is LEAD_STATUS_NO_SHOW_ATC.
 */
export function shouldWritePortalStage(
  currentStage: string | null | undefined,
  currentLeadStatus: string | null | undefined,
  newStage: string,
): boolean {
  const newRank = portalStageRank(newStage);
  if (newRank < 0) return false; // never write a value outside the order
  const currentRank = portalStageRank(currentStage);

  if (newRank > currentRank) return true;

  if (newStage === CONFIRMED_DISCOVERY && newRank < currentRank) {
    const stageIsNoShow =
      typeof currentStage === "string" &&
      currentStage.trim() === DISCOVERY_NO_SHOW_STAGE;
    const statusIsNoShowAtc =
      typeof currentLeadStatus === "string" &&
      currentLeadStatus.trim() === LEAD_STATUS_NO_SHOW_ATC;
    return stageIsNoShow || statusIsNoShowAtc;
  }

  return false;
}
