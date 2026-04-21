"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dayKeyInZone,
  enumerateDayCards,
  formatDayLabel,
  formatTimeLabel,
  formatTzAbbrev,
  type ScheduleConfig,
  type Slot,
} from "@/lib/schedule-shared";

export interface ExistingBooking {
  id: string;
  start_time: string;
  end_time: string;
  meeting_url: string | null;
  status: "confirmed" | "cancelled";
}

interface Props {
  stepId: string;
  config: ScheduleConfig;
  existingBooking: ExistingBooking | null;
  brandName: string;
  brandShortName: string;
  advisorName?: string | null;
  isGCalConfigured: boolean;
  hasAssignedRep: boolean;
  onGetSlots: (
    stepId: string,
  ) => Promise<{
    configured: boolean;
    slots: Slot[];
    error?: string;
  }>;
  onBook: (
    stepId: string,
    slotIso: string,
  ) => Promise<{
    id: string;
    start_time: string;
    end_time: string;
    meeting_url: string | null;
  }>;
  onCancel: (bookingId: string) => Promise<void>;
  onComplete: () => void;
}

export function ScheduleRenderer({
  stepId,
  config,
  existingBooking,
  brandName,
  brandShortName,
  advisorName,
  isGCalConfigured,
  hasAssignedRep,
  onGetSlots,
  onBook,
  onCancel,
  onComplete,
}: Props) {
  const router = useRouter();
  // Local mirror of the booking so the UI can flip to "booked" instantly
  // on a fresh book, before the router refresh catches up with fresh
  // props. Also lets us clear the view immediately on cancel.
  const [localBooking, setLocalBooking] = useState<ExistingBooking | null>(
    existingBooking,
  );

  useEffect(() => {
    setLocalBooking(existingBooking);
  }, [existingBooking]);

  const activeBooking =
    localBooking && localBooking.status === "confirmed" ? localBooking : null;
  const mode: "picker" | "booked" = activeBooking ? "booked" : "picker";

  if (!hasAssignedRep) {
    return (
      <div className="schedule-setup-card">
        <h3>Your advisor is being assigned</h3>
        <p>
          Check back soon — we&apos;ll introduce you to your {brandName}{" "}
          franchise growth lead shortly.
        </p>
      </div>
    );
  }

  if (!isGCalConfigured) {
    return (
      <div className="schedule-setup-card">
        <h3>Scheduling is being set up</h3>
        <p>
          We&apos;re finalizing the calendar so you can book your chat with
          the {brandName} team. Check back soon — no action needed from you
          right now.
        </p>
      </div>
    );
  }

  if (mode === "booked" && activeBooking) {
    return (
      <BookedView
        booking={activeBooking}
        timezone={config.timezone}
        eventLabel={config.event_label}
        advisorName={advisorName ?? null}
        brandShortName={brandShortName}
        onReschedule={async () => {
          await onCancel(activeBooking.id);
          setLocalBooking(null);
          router.refresh();
        }}
        onContinue={onComplete}
      />
    );
  }

  return (
    <PickerView
      stepId={stepId}
      config={config}
      brandName={brandName}
      brandShortName={brandShortName}
      advisorName={advisorName ?? null}
      onGetSlots={onGetSlots}
      onBook={onBook}
      onBooked={(result) => {
        setLocalBooking({
          id: result.id,
          start_time: result.start_time,
          end_time: result.end_time,
          meeting_url: result.meeting_url,
          status: "confirmed",
        });
        router.refresh();
      }}
    />
  );
}

// ---------- picker ----------

function PickerView({
  stepId,
  config,
  brandName,
  brandShortName,
  advisorName,
  onGetSlots,
  onBook,
  onBooked,
}: {
  stepId: string;
  config: ScheduleConfig;
  brandName: string;
  brandShortName: string;
  advisorName: string | null;
  onGetSlots: Props["onGetSlots"];
  onBook: Props["onBook"];
  onBooked: (result: {
    id: string;
    start_time: string;
    end_time: string;
    meeting_url: string | null;
  }) => void;
}) {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Slot | null>(null);
  const [booking, startBooking] = useTransition();
  const [bookError, setBookError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    onGetSlots(stepId)
      .then((result) => {
        if (cancelled) return;
        if (!result.configured) {
          setLoadError(
            result.error ??
              "Scheduling is being set up. Check back in a bit — the franchise team is finalizing the calendar.",
          );
          setSlots([]);
          return;
        }
        setSlots(result.slots);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Couldn't load availability",
          );
          setSlots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stepId, onGetSlots]);

  // Slots bucketed by day key (YYYY-MM-DD in the configured tz).
  const slotsByDay = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const key = dayKeyInZone(s.start, config.timezone);
      const arr = out.get(key) ?? [];
      arr.push(s);
      out.set(key, arr);
    }
    return out;
  }, [slots, config.timezone]);

  // All days the picker covers (whether or not they have slots).
  const dayCards = useMemo(
    () => enumerateDayCards(config.timezone, config.days_ahead),
    [config.timezone, config.days_ahead],
  );

  // Default the selected day to the first day with availability; falling
  // back to the first day in the picker if the window is entirely empty.
  useEffect(() => {
    if (selectedDay !== null) return;
    if (dayCards.length === 0) return;
    const firstWithSlots = dayCards.find((c) => slotsByDay.has(c.dayKey));
    setSelectedDay((firstWithSlots ?? dayCards[0]).dayKey);
  }, [dayCards, slotsByDay, selectedDay]);

  const slotsForSelectedDay = selectedDay
    ? slotsByDay.get(selectedDay) ?? []
    : [];

  const handleConfirmBook = () => {
    if (!confirming) return;
    setBookError(null);
    startBooking(async () => {
      try {
        const result = await onBook(stepId, confirming.start);
        setConfirming(null);
        onBooked(result);
      } catch (e) {
        setBookError(e instanceof Error ? e.message : "Booking failed");
      }
    });
  };

  const heading = advisorName
    ? `Book your call with ${advisorName} from ${brandShortName}`
    : `Book your call with ${brandShortName}`;

  const hasAnySlots = (slots?.length ?? 0) > 0;

  return (
    <div className="schedule-renderer">
      <div className="schedule-head">
        <h3>{heading}</h3>
        <p className="schedule-meta">{config.duration_minutes}-minute call</p>
        {config.body && <p className="schedule-body">{config.body}</p>}
      </div>

      {loading ? (
        <div className="schedule-loading">Loading available times…</div>
      ) : loadError ? (
        <div className="schedule-setup-card">
          <p>{loadError}</p>
        </div>
      ) : !hasAnySlots ? (
        <div className="schedule-setup-card">
          <p>
            No open times in the next {config.days_ahead} days. The{" "}
            {brandName} team is reaching out to find another slot that
            works — nothing to do on your end.
          </p>
        </div>
      ) : (
        <>
          <div
            className="schedule-day-carousel"
            role="radiogroup"
            aria-label="Select a day"
          >
            {dayCards.map((card) => {
              const hasSlots = slotsByDay.has(card.dayKey);
              const isSelected = selectedDay === card.dayKey;
              return (
                <button
                  key={card.dayKey}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={[
                    "schedule-day-card",
                    isSelected && "selected",
                    !hasSlots && "empty",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDay(card.dayKey)}
                >
                  <span className="schedule-day-card-wday">
                    {card.weekday}
                  </span>
                  <span className="schedule-day-card-num">
                    {card.dayOfMonth}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="schedule-slots-grid">
            {slotsForSelectedDay.length === 0 ? (
              <div className="schedule-slots-empty">
                No availability on this day. Try another day.
              </div>
            ) : (
              slotsForSelectedDay.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  className="schedule-slot-pill"
                  onClick={() => setConfirming(s)}
                >
                  {formatTimeLabel(s.start, config.timezone)}
                </button>
              ))
            )}
          </div>
        </>
      )}

      {confirming && (
        <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
          <div className="schedule-confirm">
            <h4>Confirm this time?</h4>
            <p className="schedule-confirm-time">
              {formatDayLabel(confirming.start, config.timezone)} at{" "}
              {formatTimeLabel(confirming.start, config.timezone)}{" "}
              {formatTzAbbrev(confirming.start, config.timezone)}
            </p>
            <p className="schedule-confirm-meta">
              {config.duration_minutes}-minute video call
              {advisorName ? ` with ${advisorName}` : ""}. You&apos;ll get
              a calendar invite with the Google Meet link right away.
            </p>
            {bookError && (
              <div className="adm-form-error adm-form-error-inline">
                {bookError}
              </div>
            )}
            <div className="schedule-confirm-actions">
              <button
                type="button"
                className="slide-nav-btn"
                onClick={() => setConfirming(null)}
                disabled={booking}
              >
                Back
              </button>
              <button
                type="button"
                className="slide-nav-btn primary"
                onClick={handleConfirmBook}
                disabled={booking}
              >
                {booking ? "Booking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- booked ----------

function BookedView({
  booking,
  timezone,
  eventLabel,
  advisorName,
  brandShortName,
  onReschedule,
  onContinue,
}: {
  booking: ExistingBooking;
  timezone: string;
  eventLabel: string;
  advisorName: string | null;
  brandShortName: string;
  onReschedule: () => Promise<void>;
  onContinue: () => void;
}) {
  const [rescheduling, startReschedule] = useTransition();

  const eventLabelLower = eventLabel.toLowerCase();
  const icsTitle = advisorName
    ? `${brandShortName} ${eventLabel} with ${advisorName}`
    : `${brandShortName} ${eventLabel}`;
  const icsFilename = `${eventLabel.toLowerCase().replace(/\s+/g, "-")}.ics`;

  const downloadIcs = () => {
    const ics = buildIcs({
      title: icsTitle,
      description: advisorName
        ? `Your ${eventLabelLower} with ${advisorName} from ${brandShortName}.`
        : `Your ${eventLabelLower} with the ${brandShortName} team.`,
      startIso: booking.start_time,
      endIso: booking.end_time,
      meetingUrl: booking.meeting_url,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = icsFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="schedule-booked">
      <div className="schedule-booked-icon">📅</div>
      <h3>You&apos;re on the calendar</h3>
      <p className="schedule-booked-primary">
        Your {eventLabelLower}
        {advisorName ? (
          <>
            {" "}
            with <strong>{advisorName}</strong>
          </>
        ) : null}{" "}
        from {brandShortName}
      </p>
      <div className="schedule-booked-time">
        {formatDayLabel(booking.start_time, timezone)} at{" "}
        {formatTimeLabel(booking.start_time, timezone)}{" "}
        {formatTzAbbrev(booking.start_time, timezone)}
      </div>
      <p className="schedule-booked-meta">
        A calendar invite with the Google Meet link is on its way to your
        inbox.
      </p>
      {booking.meeting_url && (
        <a
          href={booking.meeting_url}
          target="_blank"
          rel="noopener noreferrer"
          className="schedule-booked-link"
        >
          Open Google Meet link ↗
        </a>
      )}
      <div className="schedule-booked-actions">
        <button
          type="button"
          className="slide-nav-btn"
          onClick={downloadIcs}
        >
          Add to calendar
        </button>
        <button
          type="button"
          className="slide-nav-btn"
          onClick={() => {
            if (
              confirm(
                "Cancel this booking and pick a different time? The event will be removed from everyone's calendars.",
              )
            ) {
              startReschedule(async () => {
                await onReschedule();
              });
            }
          }}
          disabled={rescheduling}
        >
          {rescheduling ? "Cancelling…" : "Reschedule"}
        </button>
        <button
          type="button"
          className="slide-nav-btn primary"
          onClick={onContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------- .ics ----------

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function toIcsTime(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function buildIcs(args: {
  title: string;
  description: string;
  startIso: string;
  endIso: string;
  meetingUrl: string | null;
}): string {
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
