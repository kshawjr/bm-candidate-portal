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
  /** Used in the Google Calendar event title + candidate-facing booked
   * confirmation copy. e.g., "Discovery Call", "FDD Review Call". */
  event_label: string;
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

export interface DayCard {
  dayKey: string;
  weekday: string;
  dayOfMonth: string;
}

/**
 * Produce the list of day cards that make up the slot picker's horizontal
 * carousel. Days run from tomorrow (matching the server-side slot
 * generator's startOffsetDays = 1) through daysAhead-1 more days, all
 * expressed in the configured timezone.
 */
export function enumerateDayCards(
  timeZone: string,
  daysAhead: number,
): DayCard[] {
  const today = dateInZone(new Date(), timeZone);
  // Calendar-day arithmetic in UTC avoids DST edge cases — we never look
  // at the time component, just the triple.
  const anchor = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const cards: DayCard[] = [];
  for (let i = 1; i <= daysAhead; i++) {
    const next = new Date(anchor);
    next.setUTCDate(next.getUTCDate() + i);
    const y = next.getUTCFullYear();
    const m = next.getUTCMonth() + 1;
    const d = next.getUTCDate();
    // Format weekday in UTC so the day-triple matches what the user sees.
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "UTC",
    })
      .format(next)
      .toUpperCase();
    cards.push({
      dayKey: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      weekday,
      dayOfMonth: String(d),
    });
  }
  return cards;
}
