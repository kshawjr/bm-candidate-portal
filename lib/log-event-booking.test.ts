// Booking / reschedule tests for discovery_scheduled.
//
// Drives the REAL bookSlotAction + cancelBookingAction
// (app/portal/[token]/actions.ts) and the REAL logEvent
// (lib/log-event.ts). EVERY external call is mocked:
//   - Supabase (app, core, flightdeck) → one in-memory fake database
//   - Zoho → vi.fn() spies (lib/zoho-api)
//   - Google Calendar → vi.fn() (lib/google-calendar)
// Nothing here reaches the real Zoho API, Google, or any real database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/generate-application-pdf", () => ({
  generateApplicationPdf: vi.fn(),
}));
vi.mock("@/lib/upload-application-pdf", () => ({
  uploadApplicationPdf: vi.fn(),
}));

const LEAD_ID = "5380286000091668000";
const TOKEN = "tok-1";
const CANDIDATE_ID = "cand-1";
const BRAND_ID = "brand-1";
const PORTAL_ID = "portal-1";
const STEP_ID = "step-1";
const DISCOVERY_TRANSITION_ID = "5380286000093074143";

// ---------------------------------------------------------------------
// In-memory fake Supabase. Supports the query shapes used by
// actions.ts + log-event.ts: select / insert / upsert / update / delete,
// eq (including JSON paths like "metadata->>booking_id"), in, order,
// limit, maybeSingle, single, and awaiting the builder directly.
// ---------------------------------------------------------------------
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let idCounter = 0;

function readField(row: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [base, key] = col.split("->>");
    const obj = row[base] as Record<string, unknown> | null | undefined;
    const v = obj?.[key];
    return v === undefined || v === null ? null : String(v);
  }
  return row[col];
}

function fakeSupabase() {
  return {
    from(table: string) {
      tables[table] ??= [];
      type Op = "select" | "insert" | "upsert" | "update" | "delete";
      let op: Op = "select";
      let payload: Row | Row[] | null = null;
      let onConflict: string[] = [];
      let countHead = false;
      let limitN: number | null = null;
      const filters: Array<(r: Row) => boolean> = [];

      const matches = (r: Row) => filters.every((f) => f(r));

      const run = (): { data: unknown; error: null; count?: number } => {
        const rows = tables[table];
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload as Row];
          const inserted = list.map((p) => ({ id: `${table}-${++idCounter}`, ...p }));
          rows.push(...inserted);
          return { data: inserted, error: null };
        }
        if (op === "upsert") {
          const p = payload as Row;
          const existing = rows.find((r) =>
            onConflict.every((c) => r[c] === p[c]),
          );
          if (existing) {
            Object.assign(existing, p);
            return { data: [existing], error: null };
          }
          const row = { id: `${table}-${++idCounter}`, ...p };
          rows.push(row);
          return { data: [row], error: null };
        }
        if (op === "update") {
          const hit = rows.filter(matches);
          for (const r of hit) Object.assign(r, payload as Row);
          return { data: hit, error: null };
        }
        if (op === "delete") {
          const keep = rows.filter((r) => !matches(r));
          const removed = rows.filter(matches);
          tables[table] = keep;
          return { data: removed, error: null };
        }
        let hit = rows.filter(matches);
        if (limitN !== null) hit = hit.slice(0, limitN);
        if (countHead) return { data: null, error: null, count: hit.length };
        return { data: hit, error: null };
      };

      const builder: Record<string, unknown> = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) countHead = true;
          return builder;
        },
        insert(p: Row | Row[]) {
          op = "insert";
          payload = p;
          return builder;
        },
        upsert(p: Row, opts?: { onConflict?: string }) {
          op = "upsert";
          payload = p;
          onConflict = (opts?.onConflict ?? "id").split(",");
          return builder;
        },
        update(p: Row) {
          op = "update";
          payload = p;
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => readField(r, col) === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(readField(r, col)));
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          limitN = n;
          return builder;
        },
        async maybeSingle() {
          const res = run();
          const list = res.data as Row[];
          return { data: list[0] ?? null, error: null };
        },
        async single() {
          const res = run();
          const list = res.data as Row[];
          return list[0]
            ? { data: list[0], error: null }
            : { data: null, error: { message: "no rows" } };
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            return Promise.resolve(run()).then(resolve, reject);
          } catch (e) {
            return reject ? reject(e) : Promise.reject(e);
          }
        },
      };
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

const gcal = vi.hoisted(() => ({
  bookSlot: vi.fn(),
  cancelSlot: vi.fn(),
  getAvailableSlots: vi.fn(),
  isGCalConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/google-calendar", () => gcal);

import { bookSlotAction, cancelBookingAction } from "@/app/portal/[token]/actions";
import { logEvent } from "@/lib/log-event";
import { logEventByTokenAction } from "@/app/portal/[token]/event-actions";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const SLOT_1 = "2026-11-02T15:00:00.000Z";
const SLOT_2 = "2026-11-05T18:00:00.000Z";

let currentStage: string | null = null;

function seed() {
  idCounter = 0;
  tables = {
    candidates_in_portal: [
      {
        id: PORTAL_ID,
        candidate_id: CANDIDATE_ID,
        token: TOKEN,
        dismissed_chapter_completes: [],
      },
    ],
    steps_config: [
      {
        id: STEP_ID,
        brand_id: BRAND_ID,
        chapter_key: "talk",
        position: 0,
        content_type: "schedule",
        config: { duration_minutes: 30, event_label: "Discovery Call" },
        is_archived: false,
      },
    ],
    chapters_config: [
      { brand_id: BRAND_ID, chapter_key: "talk", position: 1, is_archived: false },
    ],
    candidates: [
      {
        id: CANDIDATE_ID,
        email: "pat@example.com",
        first_name: "Pat",
        last_name: "Lee",
        phone: null,
        assigned_rep_id: "rep-1",
        brand_id: BRAND_ID,
        zoho_lead_id: LEAD_ID,
      },
    ],
    brands: [
      {
        id: BRAND_ID,
        name: "Hounds Town USA",
        short_name: "Hounds Town",
        slug: "hounds-town-usa",
      },
    ],
    reps: [
      {
        id: "rep-1",
        name: "Rae",
        calendar_email: "rae@example.com",
        is_active: true,
        zoho_user_id: "zu-1",
      },
    ],
    bookings: [],
    candidate_progress: [],
    candidate_events: [],
  };
}

beforeEach(() => {
  seed();
  currentStage = null;
  for (const fn of Object.values(zoho)) fn.mockReset();
  zoho.updateLead.mockResolvedValue(undefined);
  zoho.addTags.mockResolvedValue(undefined);
  zoho.transitionLead.mockResolvedValue(undefined);
  zoho.createMeeting.mockResolvedValue({ success: true, id: "mtg-1" });
  zoho.createTask.mockResolvedValue({ success: true });
  zoho.getLead.mockImplementation(async () => ({
    id: LEAD_ID,
    FranFunnel_Stage: currentStage,
  }));
  gcal.bookSlot.mockReset();
  gcal.cancelSlot.mockReset();
  gcal.bookSlot.mockImplementation(async (a: { startIso: string; endIso: string }) => ({
    eventId: `gcal-${a.startIso}`,
    meetingUrl: "https://meet.example/abc",
    startTime: a.startIso,
    endTime: a.endIso,
  }));
  gcal.cancelSlot.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function discoveryRows() {
  return tables.candidate_events.filter(
    (r) => r.event_type === "discovery_scheduled",
  );
}

function mainUpdates() {
  return zoho.updateLead.mock.calls.filter(
    ([, f]) => f && "Portal_Status" in f,
  );
}

function zohoCallCount() {
  return Object.values(zoho).reduce((n, fn) => n + fn.mock.calls.length, 0);
}

// Asserts that ONE full booking sync happened, looking only at Zoho
// calls made since `from` (indexes into each spy's call list).
function expectFullBookingSync(
  from: Record<string, number>,
  expected: { start: string; stage: string | null },
) {
  const since = (fn: keyof typeof zoho) => zoho[fn].mock.calls.slice(from[fn]);

  const meetings = since("createMeeting");
  expect(meetings).toHaveLength(1);
  expect(meetings[0][0]).toMatchObject({
    leadId: LEAD_ID,
    startDateTime: expected.start.slice(0, 19) + "+00:00",
    ownerId: "zu-1",
  });

  const updates = since("updateLead").filter(([, f]) => "Portal_Status" in f);
  expect(updates).toHaveLength(1);
  expect(updates[0][1].Portal_Status).toBe("Discovery Scheduled");
  if (expected.stage) {
    expect(updates[0][1].FranFunnel_Stage).toBe(expected.stage);
  } else {
    expect(updates[0][1]).not.toHaveProperty("FranFunnel_Stage");
  }
  // Forward-only: stage was read before the write.
  expect(
    since("getLead").some(([, fields]) => fields?.includes("FranFunnel_Stage")),
  ).toBe(true);

  expect(since("addTags")).toEqual([[LEAD_ID, ["Discovery Call Booked"]]]);
  expect(since("transitionLead")).toEqual([[LEAD_ID, DISCOVERY_TRANSITION_ID]]);
}

function snapshot(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(zoho).map(([k, fn]) => [k, fn.mock.calls.length]),
  );
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------
describe("discovery_scheduled: once per BOOKING", () => {
  it("first booking fires the full sync (Meeting, Portal_Status, FranFunnel_Stage, tag, Blueprint)", async () => {
    currentStage = "Complete Questionnaire";
    const before = snapshot();
    const booking = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);

    expectFullBookingSync(before, { start: SLOT_1, stage: "Confirmed Discovery" });
    expect(discoveryRows()).toHaveLength(1);
    expect(discoveryRows()[0].metadata).toMatchObject({
      booking_id: booking.id,
      start_time: SLOT_1,
    });
    expect(discoveryRows()[0]).toMatchObject({
      zoho_sync_status: "success",
      blueprint_transition_status: "success",
      tag_sync_status: "success",
      stage_sync_status: "success",
    });
  });

  it("reschedule (cancel, then book again) fires the full sync a SECOND time, same as the first", async () => {
    currentStage = "Complete Questionnaire";
    const first = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);

    // Zoho now reports the stage the first booking wrote.
    currentStage = "Confirmed Discovery";
    await cancelBookingAction(TOKEN, first.id);

    const before = snapshot();
    const second = await bookSlotAction(TOKEN, STEP_ID, SLOT_2);

    expect(second.id).not.toBe(first.id);
    // Same stage value → forward-only leaves FranFunnel_Stage out;
    // everything else is identical to the first booking.
    expectFullBookingSync(before, { start: SLOT_2, stage: null });
    expect(discoveryRows()).toHaveLength(2);
    expect(discoveryRows()[1]).toMatchObject({
      blueprint_transition_status: "success",
      stage_sync_status: "skipped",
    });
    expect(mainUpdates()).toHaveLength(2);
    expect(zoho.createMeeting).toHaveBeenCalledTimes(2);
  });

  it("reschedule after a no-show moves FranFunnel_Stage back to Confirmed Discovery", async () => {
    const first = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);
    currentStage = "Discovery Call No Show";
    await cancelBookingAction(TOKEN, first.id);

    const before = snapshot();
    await bookSlotAction(TOKEN, STEP_ID, SLOT_2);
    expectFullBookingSync(before, { start: SLOT_2, stage: "Confirmed Discovery" });
  });

  it("the same booking fired twice (double click) fires only once", async () => {
    const a = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);
    const b = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);

    expect(b.id).toBe(a.id); // upsert hit the same bookings row
    expect(discoveryRows()).toHaveLength(1);
    expect(zoho.createMeeting).toHaveBeenCalledTimes(1);
    expect(mainUpdates()).toHaveLength(1);
    expect(zoho.addTags).toHaveBeenCalledTimes(1);
    expect(zoho.transitionLead).toHaveBeenCalledTimes(1);
  });

  it("the same booking logged twice directly (back/forward replay) fires only once", async () => {
    const args = {
      candidateId: CANDIDATE_ID,
      brandId: BRAND_ID,
      category: "milestone" as const,
      eventType: "discovery_scheduled",
      metadata: { booking_id: "bk-1", start_time: SLOT_1, end_time: SLOT_2 },
    };
    await logEvent(args);
    await logEvent(args);
    expect(discoveryRows()).toHaveLength(1);
    expect(zoho.createMeeting).toHaveBeenCalledTimes(1);
  });

  it("a client call cannot use booking_id to re-run the sync (stays once per candidate)", async () => {
    await bookSlotAction(TOKEN, STEP_ID, SLOT_1);
    await logEventByTokenAction(TOKEN, {
      category: "milestone",
      eventType: "discovery_scheduled",
      metadata: { booking_id: "forged-id", start_time: SLOT_2, end_time: SLOT_2 },
    });
    expect(discoveryRows()).toHaveLength(1);
    expect(zoho.createMeeting).toHaveBeenCalledTimes(1);
  });
});

describe("other milestones stay once per candidate", () => {
  it.each([
    ["portal_first_visit"],
    ["application_submitted"],
    ["welcome_video_completed"],
  ])("%s fires only once even with a booking_id in metadata", async (eventType) => {
    const call = (bookingId: string) =>
      logEvent({
        candidateId: CANDIDATE_ID,
        brandId: BRAND_ID,
        category: "milestone",
        eventType,
        metadata: { booking_id: bookingId, start_time: bookingId },
      });
    await call("x-1");
    await call("x-2");
    const rows = tables.candidate_events.filter((r) => r.event_type === eventType);
    expect(rows).toHaveLength(1);
    expect(mainUpdates()).toHaveLength(1);
  });
});

describe("Blueprint transition failure", () => {
  it("doesn't break the booking and is logged (console + blueprint_transition_* columns)", async () => {
    zoho.transitionLead.mockRejectedValue(
      new Error("Zoho transitionLead 400: transition not available from current state"),
    );
    const booking = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);

    expect(booking.id).toBeTruthy();
    expect(tables.bookings).toHaveLength(1);
    // Everything else still went out.
    expect(zoho.createMeeting).toHaveBeenCalledTimes(1);
    expect(mainUpdates()).toHaveLength(1);
    expect(zoho.addTags).toHaveBeenCalledTimes(1);

    const row = discoveryRows()[0];
    expect(row).toMatchObject({
      zoho_sync_status: "success",
      blueprint_transition_status: "failed",
    });
    expect(String(row.blueprint_transition_error)).toContain(
      "transition not available",
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Blueprint transition failed for discovery_scheduled"),
      expect.stringContaining("transition not available"),
    );
  });

  it("a reschedule whose transition fails still runs Meeting, Portal_Status and tag", async () => {
    const first = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);
    await cancelBookingAction(TOKEN, first.id);
    zoho.transitionLead.mockRejectedValue(new Error("Zoho transitionLead 400"));

    const before = snapshot();
    await bookSlotAction(TOKEN, STEP_ID, SLOT_2);
    expect(zoho.createMeeting.mock.calls.length - before.createMeeting).toBe(1);
    expect(zoho.addTags.mock.calls.length - before.addTags).toBe(1);
    expect(mainUpdates()).toHaveLength(2);
    expect(discoveryRows()[1].blueprint_transition_status).toBe("failed");
  });
});

describe("cancel", () => {
  it("adds no Zoho calls", async () => {
    const booking = await bookSlotAction(TOKEN, STEP_ID, SLOT_1);
    const before = zohoCallCount();

    await cancelBookingAction(TOKEN, booking.id);

    expect(zohoCallCount()).toBe(before);
    expect(tables.bookings).toHaveLength(0);
    expect(gcal.cancelSlot).toHaveBeenCalledTimes(1);
    const cancelled = tables.candidate_events.filter(
      (r) => r.event_type === "booking_cancelled",
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].zoho_sync_status).toBe("skipped");
  });
});
