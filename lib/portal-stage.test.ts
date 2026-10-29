import { describe, expect, it } from "vitest";
import {
  PORTAL_STAGE_BY_MILESTONE,
  PORTAL_STAGE_ORDER,
  portalStageRank,
  shouldWritePortalStage,
} from "@/lib/portal-stage";

describe("PORTAL_STAGE_BY_MILESTONE", () => {
  it("maps the four milestones to the exact Zoho picklist strings", () => {
    expect(PORTAL_STAGE_BY_MILESTONE.portal_first_visit).toBe("Access Portal");
    expect(PORTAL_STAGE_BY_MILESTONE.education_completed).toBe("Watch Overview");
    expect(PORTAL_STAGE_BY_MILESTONE.application_submitted).toBe(
      "Complete Questionnaire",
    );
    expect(PORTAL_STAGE_BY_MILESTONE.discovery_scheduled).toBe(
      "Confirmed Discovery",
    );
  });

  it("maps no other milestones", () => {
    expect(Object.keys(PORTAL_STAGE_BY_MILESTONE).sort()).toEqual(
      [
        "application_submitted",
        "discovery_scheduled",
        "education_completed",
        "portal_first_visit",
      ].sort(),
    );
  });

  it("keeps the full order earliest → latest", () => {
    expect(PORTAL_STAGE_ORDER).toEqual([
      "New Lead",
      "New MQL",
      "Access Portal",
      "Watch Overview",
      "Complete Questionnaire",
      "Confirmed Discovery",
      "Discovery Call No Show",
    ]);
  });
});

describe("shouldWritePortalStage — forward moves", () => {
  it.each([
    ["New Lead", "Access Portal"],
    ["New MQL", "Access Portal"],
    ["Access Portal", "Watch Overview"],
    ["Watch Overview", "Complete Questionnaire"],
    ["Complete Questionnaire", "Confirmed Discovery"],
    ["Access Portal", "Confirmed Discovery"],
  ])("current %s → new %s writes", (current, next) => {
    expect(shouldWritePortalStage(current, next)).toBe(true);
  });
});

describe("shouldWritePortalStage — forward-only blocking", () => {
  it("does not move Complete Questionnaire back to Access Portal", () => {
    expect(
      shouldWritePortalStage("Complete Questionnaire", "Access Portal"),
    ).toBe(false);
  });

  it("does not move Confirmed Discovery back to Watch Overview", () => {
    expect(
      shouldWritePortalStage("Confirmed Discovery", "Watch Overview"),
    ).toBe(false);
  });

  it.each([
    "Access Portal",
    "Watch Overview",
    "Complete Questionnaire",
    "Confirmed Discovery",
  ])("same value %s does not write", (v) => {
    expect(shouldWritePortalStage(v, v)).toBe(false);
  });
});

describe("shouldWritePortalStage — rebook exception", () => {
  it("Confirmed Discovery overwrites 'Discovery Call No Show'", () => {
    expect(
      shouldWritePortalStage("Discovery Call No Show", "Confirmed Discovery"),
    ).toBe(true);
  });

  it("Confirmed Discovery still overwrites No Show with surrounding spaces", () => {
    expect(
      shouldWritePortalStage("  Discovery Call No Show ", "Confirmed Discovery"),
    ).toBe(true);
  });

  it.each(["Access Portal", "Watch Overview", "Complete Questionnaire"])(
    "%s may NOT overwrite 'Discovery Call No Show'",
    (next) => {
      expect(shouldWritePortalStage("Discovery Call No Show", next)).toBe(
        false,
      );
    },
  );

  it("takes no Lead_Status input at all (decision is stage-only)", () => {
    // Two parameters: current stage, new stage. A Lead_Status argument
    // would make this 3.
    expect(shouldWritePortalStage.length).toBe(2);
  });
});

describe("shouldWritePortalStage — legacy 'Discovery Call Scheduled'", () => {
  it("ranks the same as Confirmed Discovery", () => {
    expect(portalStageRank("Discovery Call Scheduled")).toBe(
      portalStageRank("Confirmed Discovery"),
    );
  });

  it("discovery_scheduled (Confirmed Discovery) overwrites it with the new wording", () => {
    expect(
      shouldWritePortalStage("Discovery Call Scheduled", "Confirmed Discovery"),
    ).toBe(true);
  });

  it.each(["Access Portal", "Watch Overview", "Complete Questionnaire"])(
    "earlier value %s does not write over it",
    (next) => {
      expect(shouldWritePortalStage("Discovery Call Scheduled", next)).toBe(
        false,
      );
    },
  );
});

describe("shouldWritePortalStage — blank and legacy/unknown current values", () => {
  it.each([null, undefined, "", "   "])("blank current %j → writes", (cur) => {
    expect(shouldWritePortalStage(cur, "Access Portal")).toBe(true);
  });

  it.each([
    "-None-",
    "New",
    "New - Not Active",
    "New - Legacy",
    "Engaged - Business Overview",
    "Engaged - Business Overview Complete",
    "Engaged - Application Started",
    "Engaged - Needs Scheduling",
    "Schedule Discovery",
    "Reschedule Discovery",
    "Something Nobody Has Seen",
  ])("legacy/unknown current %s → Access Portal writes", (cur) => {
    expect(shouldWritePortalStage(cur, "Access Portal")).toBe(true);
  });

  it("'Engaged - Needs Scheduling' → Confirmed Discovery writes", () => {
    expect(
      shouldWritePortalStage("Engaged - Needs Scheduling", "Confirmed Discovery",
      ),
    ).toBe(true);
  });

  it("never writes a new value that is not in the order list", () => {
    expect(shouldWritePortalStage(null, "Not A Stage")).toBe(false);
  });
});
