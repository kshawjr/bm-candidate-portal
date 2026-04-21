// Shared types + formatting helpers that are safe on both server and
// client. The actual Google Calendar API wiring lives in google-calendar.ts
// (server-only, since it imports `googleapis`).

export interface ScheduleConfig {
  duration_minutes: number;
  days_ahead: number;
  start_hour: number;
  end_hour: number;
  timezone: string;
  buffer_minutes: number;
  body?: string;
}

export interface Slot {
  /** ISO UTC instant */
  start: string;
  /** ISO UTC instant */
  end: string;
}

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

/** Human-friendly day label in the configured tz, e.g. "Tue · Apr 22". */
export function formatDayLabel(isoInstant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(isoInstant));
}

/** Human-friendly time label, e.g. "9:30 AM". */
export function formatTimeLabel(isoInstant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(isoInstant));
}

/** Timezone abbreviation like "EDT" or "PST" for the booked time. */
export function formatTzAbbrev(isoInstant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
    hour: "numeric",
  }).formatToParts(new Date(isoInstant));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** ISO calendar-day string (YYYY-MM-DD) in the configured tz. Used to
 * bucket slots into per-day columns. */
export function dayKeyInZone(isoInstant: string, timeZone: string): string {
  const d = dateInZone(new Date(isoInstant), timeZone);
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}
