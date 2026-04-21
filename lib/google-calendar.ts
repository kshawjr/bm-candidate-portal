import "server-only";

import { google } from "googleapis";
import type { ScheduleConfig, Slot } from "./schedule-shared";

export type { ScheduleConfig, Slot };

export interface BookingResult {
  eventId: string;
  meetingUrl: string | null;
  startTime: string;
  endTime: string;
}

export class GCalNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`Google Calendar is not configured: ${reason}`);
    this.name = "GCalNotConfiguredError";
  }
}

export function isGCalConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
  );
}

function getAuth(subjectEmail: string) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new GCalNotConfiguredError(
      "set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env",
    );
  }
  // Keys often arrive with literal "\n" sequences when pasted from JSON.
  const privateKey = rawKey.replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    // Domain-wide delegation: the service account acts *as* the advisor.
    // Requires a workspace admin to authorize the scopes for this SA's
    // client-id (see docs/SCHEDULE_SETUP.md).
    subject: subjectEmail,
  });
}

// ---------- timezone helpers ----------

/**
 * Convert a wall-clock time in a given IANA timezone to the UTC Date that
 * represents the same moment. Uses Intl.DateTimeFormat to look up the
 * effective offset for that instant, so DST is respected.
 *
 * Month is 0-indexed to match JS Date semantics.
 */
export function zonedTimeToUtc(
  year: number,
  monthZeroIdx: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, monthZeroIdx, day, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(naiveUtc)).reduce<
    Record<string, string>
  >((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const zonedUtcGuess = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    parseInt(parts.hour, 10),
    parseInt(parts.minute, 10),
  );
  const offsetMs = naiveUtc - zonedUtcGuess;
  return new Date(naiveUtc + offsetMs);
}

/** The calendar date (year/month/day) for a UTC instant in a given tz. */
function dateInZone(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
  };
}

// Re-export formatting helpers so server-only callers can keep importing
// them from this module. Client-only callers import directly from
// ./schedule-shared to avoid pulling in googleapis.
export {
  formatDayLabel,
  formatTimeLabel,
  formatTzAbbrev,
  dayKeyInZone,
} from "./schedule-shared";

// ---------- slot generation ----------

function overlaps(
  slotStart: number,
  slotEnd: number,
  busy: { start?: string | null; end?: string | null }[],
  bufferMs: number,
): boolean {
  for (const b of busy) {
    if (!b.start || !b.end) continue;
    const bStart = Date.parse(b.start) - bufferMs;
    const bEnd = Date.parse(b.end) + bufferMs;
    if (slotStart < bEnd && slotEnd > bStart) return true;
  }
  return false;
}

/**
 * Build the list of candidate slots from "now" to (now + daysAhead) in the
 * configured tz, honoring start_hour/end_hour and duration_minutes.
 */
function generateCandidateSlots(config: ScheduleConfig): Slot[] {
  const tz = config.timezone || "America/New_York";
  const durationMs = config.duration_minutes * 60 * 1000;
  const slots: Slot[] = [];

  const today = dateInZone(new Date(), tz);
  // Start from tomorrow so candidates never see "slots in 2 hours" that
  // feel aggressive. This matches the Zac/Calendly convention the team has
  // been using.
  const startOffsetDays = 1;
  const nowMs = Date.now();

  for (let d = startOffsetDays; d < startOffsetDays + config.days_ahead; d++) {
    // Advance day-by-day in the zone by converting "today + d" to UTC via
    // the zone-aware helper. Using setDate would work in UTC but could
    // drift across DST.
    const dayStartUtc = zonedTimeToUtc(
      today.year,
      today.month - 1,
      today.day + d,
      config.start_hour,
      0,
      tz,
    );
    const dayEndUtc = zonedTimeToUtc(
      today.year,
      today.month - 1,
      today.day + d,
      config.end_hour,
      0,
      tz,
    );

    let slotStart = dayStartUtc.getTime();
    while (slotStart + durationMs <= dayEndUtc.getTime()) {
      if (slotStart > nowMs) {
        slots.push({
          start: new Date(slotStart).toISOString(),
          end: new Date(slotStart + durationMs).toISOString(),
        });
      }
      slotStart += durationMs;
    }
  }

  return slots;
}

// ---------- public API ----------

export async function getAvailableSlots(
  advisorEmail: string,
  config: ScheduleConfig,
): Promise<Slot[]> {
  if (!advisorEmail) return [];
  const slots = generateCandidateSlots(config);
  if (slots.length === 0) return [];

  const auth = getAuth(advisorEmail);
  const calendar = google.calendar({ version: "v3", auth });

  const windowStart = slots[0].start;
  const windowEnd = slots[slots.length - 1].end;
  const bufferMs = (config.buffer_minutes ?? 0) * 60 * 1000;

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart,
      timeMax: windowEnd,
      items: [{ id: advisorEmail }],
      timeZone: config.timezone,
    },
  });
  const busy = data.calendars?.[advisorEmail]?.busy ?? [];

  return slots.filter(
    (s) =>
      !overlaps(Date.parse(s.start), Date.parse(s.end), busy, bufferMs),
  );
}

export async function bookSlot(args: {
  advisorEmail: string;
  candidateEmail: string;
  candidateName: string;
  brandName: string;
  startIso: string;
  endIso: string;
  timezone: string;
}): Promise<BookingResult> {
  const auth = getAuth(args.advisorEmail);
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.insert({
    calendarId: args.advisorEmail,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: `Discovery call — ${args.candidateName} · ${args.brandName}`,
      description: `Kickoff discovery call between ${args.candidateName} and the ${args.brandName} franchise team. Scheduled via the Blue Maven candidate portal.`,
      start: { dateTime: args.startIso, timeZone: args.timezone },
      end: { dateTime: args.endIso, timeZone: args.timezone },
      attendees: [
        { email: args.candidateEmail, displayName: args.candidateName },
        { email: args.advisorEmail },
      ],
      conferenceData: {
        createRequest: {
          requestId: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: { useDefault: true },
    },
  });

  const eventId = res.data.id;
  if (!eventId) {
    throw new Error("Google Calendar did not return an event id");
  }
  const meetingUrl =
    res.data.hangoutLink ??
    res.data.conferenceData?.entryPoints?.find(
      (e) => e.entryPointType === "video",
    )?.uri ??
    null;

  return {
    eventId,
    meetingUrl,
    startTime: args.startIso,
    endTime: args.endIso,
  };
}

export async function cancelSlot(
  advisorEmail: string,
  eventId: string,
): Promise<void> {
  const auth = getAuth(advisorEmail);
  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({
      calendarId: advisorEmail,
      eventId,
      sendUpdates: "all",
    });
  } catch (e: unknown) {
    // Event already gone (manually deleted, or never existed) — treat as
    // idempotent success. Any other error propagates.
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code?: number }).code
        : undefined;
    if (code === 404 || code === 410) return;
    throw e;
  }
}

/**
 * Minimal dry-run: query the advisor's free/busy for the next 24 hours.
 * Throws a user-friendly Error when the calendar isn't accessible so the
 * admin UI can surface it in a toast. Success is silent.
 */
export async function testCalendarAccess(advisorEmail: string): Promise<void> {
  if (!advisorEmail) {
    throw new Error("No advisor email configured for this brand");
  }
  const auth = getAuth(advisorEmail);
  const calendar = google.calendar({ version: "v3", auth });
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let data;
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: tomorrow.toISOString(),
        items: [{ id: advisorEmail }],
      },
    });
    data = res.data;
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e
        ? (e as { code?: number }).code
        : undefined;
    const message =
      e && typeof e === "object" && "message" in e
        ? String((e as { message?: string }).message ?? "")
        : "";
    if (code === 401 || /invalid_grant|unauthorized/i.test(message)) {
      throw new Error(
        "Auth failed — service account credentials aren't valid. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
      );
    }
    if (code === 403 || /forbidden/i.test(message)) {
      throw new Error(
        `Calendar not accessible — share ${advisorEmail} with the service account and grant "Make changes to events".`,
      );
    }
    throw new Error(message || "Calendar check failed");
  }

  // Per-calendar errors come back inside the response body (not as HTTP
  // errors) — that's how Google reports "not shared" to a freeBusy caller.
  const errs = data.calendars?.[advisorEmail]?.errors;
  if (errs && errs.length > 0) {
    const reason = errs[0]?.reason ?? "unknown";
    if (reason === "notFound") {
      throw new Error(
        `Calendar not accessible — the service account can't see ${advisorEmail}. Ask the rep to share their calendar with the service account and grant "Make changes to events".`,
      );
    }
    throw new Error(`Calendar access failed (${reason})`);
  }
}

