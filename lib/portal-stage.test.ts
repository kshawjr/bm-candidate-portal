import { describe, expect, it } from "vitest";
import {
  LEAD_STATUS_NO_SHOW_ATC,
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
    expect(shouldWritePortalStage(current, null, next)).toBe(true);
  });
});

describe("shouldWritePortalStage — forward-only blocking", () => {
  it("does not move Complete Questionnaire back to Access Portal", () => {
    expect(
      shouldWritePortalStage("Complete Questionnaire", null, "Access Portal"),
    ).toBe(false);
  });

  it("does not move Confirmed Discovery back to Watch Overview", () => {
    expect(
      shouldWritePortalStage("Confirmed Discovery", null, "Watch Overview"),
    ).toBe(false);
  });

  it.each([
    "Access Portal",
    "Watch Overview",
    "Complete Questionnaire",
    "Confirmed Discovery",
  ])("same value %s does not write", (v) => {
    expect(shouldWritePortalStage(v, null, v)).toBe(false);
  });
});

describe("shouldWritePortalStage — rebook exception", () => {
  it("Confirmed Discovery overwrites FranFunnel_Stage 'Discovery Call No Show'", () => {
    expect(
      shouldWritePortalStage("Discovery Call No Show", null, "Confirmed Discovery"),
    ).toBe(true);
  });

  it("Confirmed Discovery overwrites a later stage when Lead_Status is the No Show ATC value", () => {
    expect(LEAD_STATUS_NO_SHOW_ATC).toBe("Discovery Call No Show ATC");
    expect(
      shouldWritePortalStage(
        "Discovery Call No Show",
        LEAD_STATUS_NO_SHOW_ATC,
        "Confirmed Discovery",
      ),
    ).toBe(true);
  });

  it("Lead_Status No Show ATC alone does not let earlier milestones overwrite", () => {
    expect(
      shouldWritePortalStage(
        "Discovery Call No Show",
        LEAD_STATUS_NO_SHOW_ATC,
        "Complete Questionnaire",
      ),
    ).toBe(false);
  });

  it.each(["Access Portal", "Watch Overview", "Complete Questionnaire"])(
    "%s may NOT overwrite 'Discovery Call No Show'",
    (next) => {
      expect(shouldWritePortalStage("Discovery Call No Show", null, next)).toBe(
        false,
      );
    },
  );

  it("an unrelated Lead_Status does not unlock anything", () => {
    expect(
      shouldWritePortalStage("Discovery Call No Show", "Engaged", "Access Portal"),
    ).toBe(false);
  });
});

describe("shouldWritePortalStage — legacy 'Discovery Call Scheduled'", () => {
  it("ranks the same as Confirmed Discovery", () => {
    expect(portalStageRank("Discovery Call Scheduled")).toBe(
      portalStageRank("Confirmed Discovery"),
    );
  });

  it("discovery_scheduled (Confirmed Discovery) does not write over it", () => {
    expect(
      shouldWritePortalStage("Discovery Call Scheduled", null, "Confirmed Discovery"),
    ).toBe(false);
  });

  it.each(["Access Portal", "Watch Overview", "Complete Questionnaire"])(
    "earlier value %s does not write over it",
    (next) => {
      expect(
        shouldWritePortalStage("Discovery Call Scheduled", null, next),
      ).toBe(false);
    },
  );
});

describe("shouldWritePortalStage — blank and legacy/unknown current values", () => {
  it.each([null, undefined, "", "   "])("blank current %j → writes", (cur) => {
    expect(shouldWritePortalStage(cur, null, "Access Portal")).toBe(true);
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
    expect(shouldWritePortalStage(cur, null, "Access Portal")).toBe(true);
  });

  it("'Engaged - Needs Scheduling' → Confirmed Discovery writes", () => {
    expect(
      shouldWritePortalStage(
        "Engaged - Needs Scheduling",
        null,
        "Confirmed Discovery",
      ),
    ).toBe(true);
  });

  it("never writes a new value that is not in the order list", () => {
    expect(shouldWritePortalStage(null, null, "Not A Stage")).toBe(false);
  });
});
