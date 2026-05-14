// Booking display helpers shared by the schedule renderer and the
// waiting renderer. `formatDayLabel` / `formatTimeLabel` /
// `formatTzAbbrev` already live in `lib/schedule-shared.ts` next to
// the ScheduleConfig types — this module adds the long-form
// "Tuesday, May 20" variant the waiting renderer needs for its
// `{discovery_call_date}` template var, then re-exports the rest so
// callers have a single import point for booking display.

export {
  formatDayLabel,
  formatTimeLabel,
  formatTzAbbrev,
} from "@/lib/schedule-shared";

/** "Tuesday, May 20" — the long-form date format used in the waiting
 *  step's "See you on {discovery_call_date}" template variable. */
export function formatBookingDateLong(
  isoInstant: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(isoInstant));
}

// ICS builder — same shape as the inline one in
// components/content-types/schedule-renderer.tsx (intentional
// duplication for now; folding the renderer's BookedView onto this
// helper is a future cleanup).
function toIcsTime(iso: string): string {
  // YYYYMMDDTHHMMSSZ
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export interface BuildIcsArgs {
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  meetingUrl: string | null;
}

export function buildIcs(args: BuildIcsArgs): string {
  const desc = args.meetingUrl
    ? `${args.description}\n\nGoogle Meet: ${args.meetingUrl}`
    : args.description;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blue Maven//Candidate Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-bmp@bmave.com`,
    `DTSTAMP:${toIcsTime(new Date().toISOString())}`,
    `DTSTART:${toIcsTime(args.startIso)}`,
    `DTEND:${toIcsTime(args.endIso)}`,
    `SUMMARY:${escapeIcs(args.title)}`,
    `DESCRIPTION:${escapeIcs(desc)}`,
    args.meetingUrl ? `URL:${args.meetingUrl}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
