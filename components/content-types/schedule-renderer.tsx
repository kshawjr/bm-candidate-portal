"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dayKeyInZone,
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
  advisorName?: string | null;
  isGCalConfigured: boolean;
  hasAdvisorEmail: boolean;
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
  advisorName,
  isGCalConfigured,
  hasAdvisorEmail,
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

  if (!isGCalConfigured || !hasAdvisorEmail) {
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
        advisorName={advisorName ?? null}
        brandName={brandName}
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
  advisorName,
  onGetSlots,
  onBook,
  onBooked,
}: {
  stepId: string;
  config: ScheduleConfig;
  brandName: string;
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

  const grouped = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const key = dayKeyInZone(s.start, config.timezone);
      const arr = out.get(key) ?? [];
      arr.push(s);
      out.set(key, arr);
    }
    return Array.from(out.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [slots, config.timezone]);

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

  return (
    <div className="schedule-renderer">
      <div className="schedule-head">
        <h3>Book your discovery call</h3>
        {config.body && <p className="schedule-body">{config.body}</p>}
        <p className="schedule-meta">
          {config.duration_minutes}-minute call
          {advisorName ? ` with ${advisorName}` : ` with the ${brandName} team`}
        </p>
      </div>

      {loading ? (
        <div className="schedule-loading">Loading available times…</div>
      ) : loadError ? (
        <div className="schedule-setup-card">
          <p>{loadError}</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="schedule-setup-card">
          <p>
            No open times in the next {config.days_ahead} days. The team is
            reaching out to find another slot that works — nothing to do on
            your end.
          </p>
        </div>
      ) : (
        <div className="schedule-grid">
          {grouped.map(([dayKey, daySlots]) => {
            const first = daySlots[0];
            return (
              <div key={dayKey} className="schedule-day">
                <div className="schedule-day-label">
                  {formatDayLabel(first.start, config.timezone)}
                </div>
                <div className="schedule-day-slots">
                  {daySlots.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      className="schedule-slot-pill"
                      onClick={() => setConfirming(s)}
                    >
                      {formatTimeLabel(s.start, config.timezone)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
              {config.duration_minutes}-minute video call with the{" "}
              {brandName} team. You&apos;ll get a calendar invite with the
              Google Meet link right away.
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
  advisorName,
  brandName,
  onReschedule,
  onContinue,
}: {
  booking: ExistingBooking;
  timezone: string;
  advisorName: string | null;
  brandName: string;
  onReschedule: () => Promise<void>;
  onContinue: () => void;
}) {
  const [rescheduling, startReschedule] = useTransition();

  const downloadIcs = () => {
    const ics = buildIcs({
      title: `Discovery call · ${brandName}`,
      description: advisorName
        ? `Chat with ${advisorName} from the ${brandName} team.`
        : `Chat with the ${brandName} team.`,
      startIso: booking.start_time,
      endIso: booking.end_time,
      meetingUrl: booking.meeting_url,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "discovery-call.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="schedule-booked">
      <div className="schedule-booked-icon">📅</div>
      <h3>You&apos;re on the calendar</h3>
      <div className="schedule-booked-time">
        {formatDayLabel(booking.start_time, timezone)} at{" "}
        {formatTimeLabel(booking.start_time, timezone)}{" "}
        {formatTzAbbrev(booking.start_time, timezone)}
      </div>
      <p className="schedule-booked-meta">
        {advisorName
          ? `You'll meet with ${advisorName} from the ${brandName} team.`
          : `You'll meet with the ${brandName} team.`}{" "}
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
