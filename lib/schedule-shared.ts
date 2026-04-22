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
  /** Bookable days-of-week, using JS Date.getDay() semantics
   * (0 = Sun … 6 = Sat). Default is Mon-Fri: [1, 2, 3, 4, 5]. */
  working_days: number[];
  /** Minimum hours of notice the candidate must give. Server-side filter
   * on slot.start — never allowed to book inside this window. */
  min_notice_hours: number;
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
  dayOfMonth: string;
  isPast: boolean;
  isToday: boolean;
}

/**
 * Produce the list of day cards that make up the slot picker's 7-column
 * calendar grid. Cards start from the Sunday of the current week (US
 * convention, in the configured timezone) and run forward for enough
 * complete weeks to cover `today + daysAhead`.
 *
 * Past days (and today) come back flagged so the renderer can grey them
 * out without losing grid alignment.
 */
export function enumerateDayCards(
  timeZone: string,
  daysAhead: number,
): DayCard[] {
  const today = dateInZone(new Date(), timeZone);
  const todayKey = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;

  // Calendar-day arithmetic in UTC avoids DST edge cases — we never look
  // at the time component, just the triple.
  const todayAnchor = new Date(
    Date.UTC(today.year, today.month - 1, today.day),
  );

  // JS Date weekday: 0=Sun, 1=Mon, ..., 6=Sat. US-convention week starts
  // on Sunday, so the offset is just getUTCDay() directly.
  const offsetFromSunday = todayAnchor.getUTCDay();

  // Span we need to cover: past days this week (offset), today (1), and
  // daysAhead future days. Round up to complete weeks so the grid stays
  // rectangular.
  const span = offsetFromSunday + 1 + daysAhead;
  const totalCards = Math.ceil(span / 7) * 7;

  const sundayAnchor = new Date(todayAnchor);
  sundayAnchor.setUTCDate(sundayAnchor.getUTCDate() - offsetFromSunday);

  const cards: DayCard[] = [];
  for (let i = 0; i < totalCards; i++) {
    const d = new Date(sundayAnchor);
    d.setUTCDate(d.getUTCDate() + i);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    const dayKey = `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    cards.push({
      dayKey,
      dayOfMonth: String(dd),
      isPast: i < offsetFromSunday,
      isToday: dayKey === todayKey,
    });
  }
  return cards;
}
