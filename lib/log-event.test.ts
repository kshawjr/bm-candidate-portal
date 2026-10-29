// Integration-style tests for the FranFunnel_Stage sync inside logEvent.
// EVERY external call is mocked: Supabase clients and the Zoho client.
// Nothing here reaches the real Zoho API or any real database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const LEAD_ID = "5380286000091668000";
const EVENT_ID = "evt-123";

// Per-test knobs for what the fake Supabase returns.
const db = {
  zohoLeadId: LEAD_ID as string | null,
};

// Minimal chainable Supabase query fake. Every builder method returns
// the builder; terminal calls resolve to canned rows keyed by table.
function fakeSupabase() {
  return {
    from(table: string) {
      const result = () => {
        if (table === "candidates") {
          return { data: { zoho_lead_id: db.zohoLeadId }, error: null };
        }
        if (table === "brands") {
          return { data: { slug: "hounds-town-usa" }, error: null };
        }
        return { data: null, error: null };
      };
      let inserting = false;
      const builder: Record<string, unknown> = {};
      for (const m of [
        "select",
        "eq",
        "in",
        "order",
        "limit",
        "update",
      ]) {
        builder[m] = () => builder;
      }
      builder.insert = () => {
        inserting = true;
        return builder;
      };
      builder.maybeSingle = async () => result();
      builder.single = async () =>
        inserting && table === "candidate_events"
          ? { data: { id: EVENT_ID }, error: null }
          : result();
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: null });
      return builder;
    },
  };
}

vi.mock("@/lib/supabase-app", () => ({
  createAppServiceClient: () => fakeSupabase(),
}));
vi.mock("@/lib/core-client", () => ({
  createCoreClient: () => fakeSupabase(),
}));
vi.mock("@/lib/flightdeck-client", () => ({
  createFlightdeckClient: () => fakeSupabase(),
}));

const zoho = vi.hoisted(() => ({
  updateLead: vi.fn(),
  getLead: vi.fn(),
  addTags: vi.fn(),
  transitionLead: vi.fn(),
  createMeeting: vi.fn(),
  createTask: vi.fn(),
}));
vi.mock("@/lib/zoho-api", () => ({ zohoApi: zoho }));

import { logEvent } from "@/lib/log-event";

function milestone(eventType: string) {
  return logEvent({
    candidateId: "cand-1",
    brandId: "brand-1",
    category: "milestone",
    eventType,
    metadata: {},
  });
}

// Calls to updateLead that carry FranFunnel_Stage.
function stageWrites() {
  return zoho.updateLead.mock.calls.filter(
    ([, fields]) => fields && "FranFunnel_Stage" in fields,
  );
}

function leadReturns(stage: string | null, leadStatus: string | null = null) {
  zoho.getLead.mockImplementation(async (_id: string, fields?: string[]) => {
    if (fields?.includes("FranFunnel_Stage")) {
      return { id: LEAD_ID, FranFunnel_Stage: stage, Lead_Status: leadStatus };
    }
    return { id: LEAD_ID };
  });
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.zohoLeadId = LEAD_ID;
  zoho.updateLead.mockResolvedValue(undefined);
  zoho.addTags.mockResolvedValue(undefined);
  zoho.transitionLead.mockResolvedValue(undefined);
  zoho.createMeeting.mockResolvedValue({ success: true });
  zoho.createTask.mockResolvedValue({ success: true });
  leadReturns(null);
  vi.spyOn(console, "log").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("logEvent → FranFunnel_Stage mappings", () => {
  it.each([
    ["portal_first_visit", "Access Portal"],
    ["education_completed", "Watch Overview"],
    ["application_submitted", "Complete Questionnaire"],
    ["discovery_scheduled", "Confirmed Discovery"],
  ])("%s writes %s on a blank lead", async (eventType, value) => {
    leadReturns(null);
    await milestone(eventType);
    expect(zoho.getLead).toHaveBeenCalledWith(LEAD_ID, [
      "FranFunnel_Stage",
      "Lead_Status",
    ]);
    expect(stageWrites()).toEqual([[LEAD_ID, { FranFunnel_Stage: value }]]);
  });

  it("no longer writes the old 'Discovery Call Scheduled' value", async () => {
    await milestone("discovery_scheduled");
    for (const [, fields] of zoho.updateLead.mock.calls) {
      expect(Object.values(fields)).not.toContain("Discovery Call Scheduled");
    }
  });

  it("unmapped milestones do not read or write FranFunnel_Stage", async () => {
    await milestone("brand_tour_engaged");
    expect(zoho.getLead).not.toHaveBeenCalled();
    expect(stageWrites()).toEqual([]);
  });
});

describe("logEvent → forward-only", () => {
  it("current Complete Questionnaire + portal_first_visit → no write", async () => {
    leadReturns("Complete Questionnaire");
    await milestone("portal_first_visit");
    expect(stageWrites()).toEqual([]);
  });

  it("same value → no write", async () => {
    leadReturns("Watch Overview");
    await milestone("education_completed");
    expect(stageWrites()).toEqual([]);
  });

  it("rebook via FranFunnel_Stage 'Discovery Call No Show' writes Confirmed Discovery", async () => {
    leadReturns("Discovery Call No Show");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toEqual([
      [LEAD_ID, { FranFunnel_Stage: "Confirmed Discovery" }],
    ]);
  });

  it("rebook via Lead_Status 'Discovery Call No Show ATC' writes Confirmed Discovery", async () => {
    leadReturns("Discovery Call No Show", "Discovery Call No Show ATC");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toEqual([
      [LEAD_ID, { FranFunnel_Stage: "Confirmed Discovery" }],
    ]);
  });

  it("other milestones may NOT overwrite 'Discovery Call No Show'", async () => {
    leadReturns("Discovery Call No Show", "Discovery Call No Show ATC");
    await milestone("application_submitted");
    expect(stageWrites()).toEqual([]);
  });

  it("legacy 'Discovery Call Scheduled': discovery_scheduled does not write", async () => {
    leadReturns("Discovery Call Scheduled");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toEqual([]);
  });

  it("legacy 'Discovery Call Scheduled': earlier milestone does not write", async () => {
    leadReturns("Discovery Call Scheduled");
    await milestone("education_completed");
    expect(stageWrites()).toEqual([]);
  });

  it("legacy/unknown current 'Engaged - Needs Scheduling' is overwritten", async () => {
    leadReturns("Engaged - Needs Scheduling");
    await milestone("portal_first_visit");
    expect(stageWrites()).toEqual([
      [LEAD_ID, { FranFunnel_Stage: "Access Portal" }],
    ]);
  });
});

describe("logEvent → failures never escape and are logged", () => {
  it("Zoho read failure: no throw, no stage write, logged", async () => {
    zoho.getLead.mockRejectedValue(new Error("Zoho getLead 500: boom"));
    await expect(milestone("portal_first_visit")).resolves.toBeUndefined();
    expect(stageWrites()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage read failed for event ${EVENT_ID}:`,
      "Zoho getLead 500: boom",
    );
    // Other milestone syncs still ran.
    expect(zoho.addTags).toHaveBeenCalled();
  });

  it("Zoho write failure: no throw, logged", async () => {
    zoho.updateLead.mockImplementation(
      async (_id: string, fields: Record<string, string>) => {
        if ("FranFunnel_Stage" in fields) {
          throw new Error("Zoho updateLead 400: INVALID_DATA");
        }
      },
    );
    await expect(milestone("discovery_scheduled")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage write failed for event ${EVENT_ID}:`,
      "Zoho updateLead 400: INVALID_DATA",
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("syncMilestoneToZoho threw"),
      expect.anything(),
    );
  });

  it("network error (TypeError) on read: no throw, logged", async () => {
    zoho.getLead.mockRejectedValue(new TypeError("fetch failed"));
    await expect(milestone("education_completed")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage read failed for event ${EVENT_ID}:`,
      "fetch failed",
    );
  });

  it("missing Zoho lead id: no Zoho calls, no throw", async () => {
    db.zohoLeadId = null;
    await expect(milestone("portal_first_visit")).resolves.toBeUndefined();
    expect(zoho.getLead).not.toHaveBeenCalled();
    expect(zoho.updateLead).not.toHaveBeenCalled();
  });
});

describe("logEvent → workflow triggers stay on", () => {
  it("the FranFunnel_Stage write passes no trigger option", async () => {
    await milestone("portal_first_visit");
    const [call] = stageWrites();
    // Exactly (leadId, fields): no third options argument, and no
    // `trigger` key smuggled into the field payload.
    expect(call).toHaveLength(2);
    expect(call[1]).not.toHaveProperty("trigger");
  });
});
