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
  // Simulate the stage_sync_* columns not existing yet (migration not
  // applied): any update touching them resolves with a PostgREST error.
  stageColumnsMissing: false,
};

// Every candidate_events UPDATE payload, in order.
const eventUpdates: Record<string, unknown>[] = [];

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
      let updatePayload: Record<string, unknown> | null = null;
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) {
        builder[m] = () => builder;
      }
      builder.update = (payload: Record<string, unknown>) => {
        updatePayload = payload;
        if (table === "candidate_events") eventUpdates.push(payload);
        return builder;
      };
      builder.insert = () => {
        inserting = true;
        return builder;
      };
      builder.maybeSingle = async () => result();
      builder.single = async () =>
        inserting && table === "candidate_events"
          ? { data: { id: EVENT_ID }, error: null }
          : result();
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (
          db.stageColumnsMissing &&
          updatePayload &&
          "stage_sync_status" in updatePayload
        ) {
          return resolve({
            data: null,
            error: {
              message:
                "Could not find the 'stage_sync_error' column of 'candidate_events' in the schema cache",
            },
          });
        }
        return resolve({ data: null, error: null });
      };
      return builder;
    },
  };
}

// The candidate_events update that carries stage_sync_status, if any.
function stageStatusUpdates() {
  return eventUpdates.filter((u) => "stage_sync_status" in u);
}

// The main trailing status update (carries zoho_sync_status).
function mainStatusUpdate() {
  return eventUpdates.find((u) => "zoho_sync_status" in u);
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

// Calls to updateLead that carry Portal_Status (the main update).
function mainUpdates() {
  return zoho.updateLead.mock.calls.filter(
    ([, fields]) => fields && "Portal_Status" in fields,
  );
}

function leadReturns(stage: string | null, extra: Record<string, unknown> = {}) {
  zoho.getLead.mockImplementation(async (_id: string, fields?: string[]) => {
    if (fields?.includes("FranFunnel_Stage")) {
      return { id: LEAD_ID, FranFunnel_Stage: stage, ...extra };
    }
    return { id: LEAD_ID };
  });
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.zohoLeadId = LEAD_ID;
  db.stageColumnsMissing = false;
  eventUpdates.length = 0;
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

const STAGE_MILESTONES = [
  ["portal_first_visit", "Access Portal"],
  ["education_completed", "Watch Overview"],
  ["application_submitted", "Complete Questionnaire"],
  ["discovery_scheduled", "Confirmed Discovery"],
] as const;

describe("logEvent → FranFunnel_Stage mappings", () => {
  it.each(STAGE_MILESTONES)(
    "%s writes %s on a blank lead",
    async (eventType, value) => {
      leadReturns(null);
      await milestone(eventType);
      expect(zoho.getLead).toHaveBeenCalledWith(LEAD_ID, ["FranFunnel_Stage"]);
      expect(stageWrites()).toHaveLength(1);
      expect(stageWrites()[0][1].FranFunnel_Stage).toBe(value);
    },
  );

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
    expect(stageStatusUpdates()).toEqual([]);
  });
});

describe("logEvent → ONE Zoho save (stage rides in the main update)", () => {
  it.each(STAGE_MILESTONES)(
    "%s: Portal_Status and FranFunnel_Stage go in exactly one updateLead call",
    async (eventType, value) => {
      leadReturns(null);
      await milestone(eventType);
      expect(stageWrites()).toHaveLength(1);
      expect(mainUpdates()).toHaveLength(1);
      const [leadId, fields] = stageWrites()[0];
      expect(leadId).toBe(LEAD_ID);
      expect(fields).toEqual({
        Last_Active_Date: expect.any(String),
        Portal_Status: expect.any(String),
        FranFunnel_Stage: value,
      });
      // The stage write IS the main update, not a second call.
      expect(stageWrites()[0]).toBe(mainUpdates()[0]);
    },
  );

  it("reads the current stage BEFORE the main update", async () => {
    await milestone("portal_first_visit");
    const readOrder = zoho.getLead.mock.invocationCallOrder[0];
    const writeOrder = zoho.updateLead.mock.invocationCallOrder[0];
    expect(readOrder).toBeLessThan(writeOrder);
  });

  it("when the rule says no, the main update goes out without FranFunnel_Stage", async () => {
    leadReturns("Complete Questionnaire");
    await milestone("portal_first_visit");
    expect(mainUpdates()).toHaveLength(1);
    expect(mainUpdates()[0][1]).not.toHaveProperty("FranFunnel_Stage");
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

  it("same value Confirmed Discovery → no write", async () => {
    leadReturns("Confirmed Discovery");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toEqual([]);
  });

  it("rebook: 'Discovery Call No Show' → discovery_scheduled writes Confirmed Discovery", async () => {
    leadReturns("Discovery Call No Show");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toHaveLength(1);
    expect(stageWrites()[0][1].FranFunnel_Stage).toBe("Confirmed Discovery");
  });

  it.each(["portal_first_visit", "education_completed", "application_submitted"])(
    "%s may NOT overwrite 'Discovery Call No Show'",
    async (eventType) => {
      leadReturns("Discovery Call No Show");
      await milestone(eventType);
      expect(stageWrites()).toEqual([]);
    },
  );

  it("Lead_Status is not read", async () => {
    await milestone("discovery_scheduled");
    for (const [, fields] of zoho.getLead.mock.calls) {
      expect(fields ?? []).not.toContain("Lead_Status");
    }
  });

  it("a Lead_Status value on the lead has no effect", async () => {
    // Even if Zoho returned a no-show Lead_Status, a later stage with an
    // earlier milestone must still be skipped...
    leadReturns("Discovery Call No Show", {
      Lead_Status: "Discovery Call No Show ATC",
    });
    await milestone("application_submitted");
    expect(stageWrites()).toEqual([]);

    // ...and Confirmed Discovery over Confirmed Discovery is still a skip.
    vi.clearAllMocks();
    zoho.updateLead.mockResolvedValue(undefined);
    zoho.addTags.mockResolvedValue(undefined);
    zoho.transitionLead.mockResolvedValue(undefined);
    zoho.createMeeting.mockResolvedValue({ success: true });
    leadReturns("Confirmed Discovery", {
      Lead_Status: "Discovery Call No Show ATC",
    });
    await milestone("discovery_scheduled");
    expect(stageWrites()).toEqual([]);
  });

  it("legacy 'Discovery Call Scheduled': discovery_scheduled writes Confirmed Discovery", async () => {
    leadReturns("Discovery Call Scheduled");
    await milestone("discovery_scheduled");
    expect(stageWrites()).toHaveLength(1);
    expect(stageWrites()[0][1].FranFunnel_Stage).toBe("Confirmed Discovery");
  });

  it.each(["portal_first_visit", "education_completed", "application_submitted"])(
    "legacy 'Discovery Call Scheduled': %s does not write",
    async (eventType) => {
      leadReturns("Discovery Call Scheduled");
      await milestone(eventType);
      expect(stageWrites()).toEqual([]);
    },
  );

  it("legacy/unknown current 'Engaged - Needs Scheduling' is overwritten", async () => {
    leadReturns("Engaged - Needs Scheduling");
    await milestone("portal_first_visit");
    expect(stageWrites()).toHaveLength(1);
    expect(stageWrites()[0][1].FranFunnel_Stage).toBe("Access Portal");
  });
});

describe("logEvent → stage read failures never touch the main update", () => {
  it.each(STAGE_MILESTONES)(
    "%s: read throws → single main update still goes out, without FranFunnel_Stage",
    async (eventType) => {
      zoho.getLead.mockRejectedValue(new Error("Zoho getLead 500: boom"));
      await expect(milestone(eventType)).resolves.toBeUndefined();
      expect(mainUpdates()).toHaveLength(1);
      const [, fields] = mainUpdates()[0];
      expect(fields).not.toHaveProperty("FranFunnel_Stage");
      expect(fields).toHaveProperty("Portal_Status");
      expect(fields).toHaveProperty("Last_Active_Date");
      expect(stageWrites()).toEqual([]);
      expect(mainStatusUpdate()?.zoho_sync_status).toBe("success");
      expect(zoho.addTags).toHaveBeenCalled();
    },
  );

  it("lead not found → main update still goes out, without FranFunnel_Stage", async () => {
    zoho.getLead.mockResolvedValue(null);
    await milestone("education_completed");
    expect(mainUpdates()).toHaveLength(1);
    expect(mainUpdates()[0][1]).not.toHaveProperty("FranFunnel_Stage");
    expect(mainStatusUpdate()?.zoho_sync_status).toBe("success");
  });

  it("network error (TypeError) on read: no throw, logged", async () => {
    zoho.getLead.mockRejectedValue(new TypeError("fetch failed"));
    await expect(milestone("education_completed")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage read failed for event ${EVENT_ID}:`,
      "fetch failed",
    );
  });
});

describe("logEvent → stage outcome saved to candidate_events.stage_sync_status", () => {
  it("written → success", async () => {
    await milestone("portal_first_visit");
    expect(stageStatusUpdates()).toEqual([
      { stage_sync_status: "success", stage_sync_error: null },
    ]);
  });

  it("forward-only rule said no → skipped", async () => {
    leadReturns("Complete Questionnaire");
    await milestone("portal_first_visit");
    expect(stageStatusUpdates()).toEqual([
      { stage_sync_status: "skipped", stage_sync_error: null },
    ]);
  });

  it("read failure → failed, with reason; console log kept", async () => {
    zoho.getLead.mockRejectedValue(new Error("Zoho getLead 500: boom"));
    await milestone("portal_first_visit");
    expect(stageStatusUpdates()).toEqual([
      {
        stage_sync_status: "failed",
        stage_sync_error: "FranFunnel_Stage read failed: Zoho getLead 500: boom",
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage read failed for event ${EVENT_ID}:`,
      "Zoho getLead 500: boom",
    );
  });

  it("lead not found → failed", async () => {
    zoho.getLead.mockResolvedValue(null);
    await milestone("portal_first_visit");
    expect(stageStatusUpdates()).toEqual([
      {
        stage_sync_status: "failed",
        stage_sync_error: "FranFunnel_Stage read returned no lead",
      },
    ]);
  });

  it("main update carrying the stage fails → failed, logged, no throw", async () => {
    zoho.updateLead.mockRejectedValue(
      new Error("Zoho updateLead 400: INVALID_DATA"),
    );
    await expect(milestone("discovery_scheduled")).resolves.toBeUndefined();
    expect(stageStatusUpdates()).toEqual([
      {
        stage_sync_status: "failed",
        stage_sync_error: "Zoho updateLead 400: INVALID_DATA",
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      `[log-event] FranFunnel_Stage write failed for event ${EVENT_ID}:`,
      "Zoho updateLead 400: INVALID_DATA",
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("syncMilestoneToZoho threw"),
      expect.anything(),
    );
  });

  it("no zoho_lead_id → skipped, no Zoho calls, no throw", async () => {
    db.zohoLeadId = null;
    await expect(milestone("portal_first_visit")).resolves.toBeUndefined();
    expect(zoho.getLead).not.toHaveBeenCalled();
    expect(zoho.updateLead).not.toHaveBeenCalled();
    expect(stageStatusUpdates()).toEqual([
      { stage_sync_status: "skipped", stage_sync_error: null },
    ]);
  });

  it("stage status is a separate UPDATE from the main status columns", async () => {
    await milestone("portal_first_visit");
    expect(mainStatusUpdate()).toBeDefined();
    expect(mainStatusUpdate()).not.toHaveProperty("stage_sync_status");
  });

  it("columns missing (migration not applied): event still syncs, no throw, warning logged", async () => {
    db.stageColumnsMissing = true;
    await expect(milestone("portal_first_visit")).resolves.toBeUndefined();
    expect(mainStatusUpdate()?.zoho_sync_status).toBe("success");
    expect(warn).toHaveBeenCalledWith(
      `[log-event] stage_sync_status write failed for event ${EVENT_ID}:`,
      expect.stringContaining("stage_sync_error"),
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("syncMilestoneToZoho threw"),
      expect.anything(),
    );
  });
});

describe("logEvent → workflow triggers stay on", () => {
  it("the update carrying FranFunnel_Stage passes no trigger option", async () => {
    await milestone("portal_first_visit");
    const [call] = stageWrites();
    // Exactly (leadId, fields): no third options argument, and no
    // `trigger` key smuggled into the field payload.
    expect(call).toHaveLength(2);
    expect(call[1]).not.toHaveProperty("trigger");
  });
});
