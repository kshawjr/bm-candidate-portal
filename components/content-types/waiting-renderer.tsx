"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useCandidateUnlocks } from "@/lib/hooks/use-candidate-unlocks";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { resolveTemplate, type TemplateContext } from "@/lib/template-resolver";
import type { UnlockKey } from "@/lib/unlock-keys";
import {
  buildIcs,
  formatDayLabel,
  formatTimeLabel,
  formatTzAbbrev,
} from "@/lib/booking-details";
import type { ExistingBooking } from "@/components/content-types/schedule-renderer";
import type { ScheduleConfig } from "@/lib/schedule-shared";

export interface WaitingConfig {
  unlock_key: UnlockKey;

  // Parked state
  heading: string;
  subheading: string;
  show_booking_details: boolean;
  what_happens_next: string[];
  next_unlock_preview: {
    label: string;
    description: string;
    eta_copy: string;
  };
  expectation_copy: string;

  // Unlocked state
  unlocked_heading: string;
  unlocked_cta_label: string;
}

interface Props {
  config: WaitingConfig;
  /** bmave-core.candidates.id. The shared useCandidateUnlocks hook
   *  filters candidates_in_portal by `candidate_id=eq.${candidateId}`
   *  so every renderer using the hook (waiting, card strip, future
   *  consumers) keys off the same stable identifier. */
  candidateId: string;
  /** Snapshot of unlocked_keys at server-render time. Seeds the hook's
   *  state so the first paint matches the candidate's actual unlock
   *  state — no flash from [] → real value. */
  initialUnlockedKeys: string[];
  templateContext: TemplateContext;
  /** The candidate's upcoming discovery-call booking, or null. Pulled
   *  from the chapter's schedule step in the parent dispatcher. */
  booking: ExistingBooking | null;
  /** Schedule config from the same chapter's schedule step — drives
   *  the timezone for date / time labels. */
  scheduleConfig: ScheduleConfig | null;
  /** Brand display name, used in ICS event title + reschedule copy. */
  brandShortName: string;
  /** Full advisor name ("Sierra Jones") for the ICS event. The first
   *  name is already in templateContext.rep_first_name for the
   *  in-page display copy. */
  advisorName: string | null;
  /** Cancel the booking (lets the candidate reschedule). Null when
   *  not provided — the Reschedule button is hidden in that case. */
  onCancelBooking?: (bookingId: string) => Promise<void>;
  /** PR 131: navigate the candidate back to the chapter's schedule
   *  step so they can use the BookedView's Reschedule flow. Optional;
   *  when absent, the "Need to reschedule?" footer link is hidden.
   *  Also hidden when there's no booking — nothing to reschedule. */
  onRescheduleNavigate?: () => void;
  /** Advance to the next step in the chapter (or finish the chapter
   *  if this is the last step). Called when the unlocked-state CTA
   *  is clicked. */
  onContinue: () => void;
  /** Optional preview-override for the admin editor's live preview
   *  pane. When set, the renderer ignores realtime + initial state
   *  and forces the parked / unlocked branch. */
  previewState?: "parked" | "unlocked";
}

// Fade timing for the parked → unlocked transition. Matches the
// chapter-video popup's 200ms fade-out pattern for visual cohesion.
const FADE_OUT_MS = 400;
const FADE_IN_DELAY_MS = 100; // stagger between fade-out and fade-in start

export function WaitingRenderer({
  config,
  candidateId,
  initialUnlockedKeys,
  templateContext,
  booking,
  scheduleConfig,
  brandShortName,
  advisorName,
  onCancelBooking,
  onRescheduleNavigate,
  onContinue,
  previewState,
}: Props) {
  const reduceMotion = useReducedMotion();
  const initialUnlocked = initialUnlockedKeys.includes(config.unlock_key);

  // Pass null when in admin preview so the hook skips its subscription
  // — the admin doesn't have a candidate context to read live unlocks
  // from. Real candidates always pass a real ID.
  const { unlocks } = useCandidateUnlocks(
    previewState ? null : candidateId,
    initialUnlockedKeys,
  );

  // Three visible states: parked, fading (parked→unlocked transition),
  // unlocked. previewState overrides the realtime path so the admin
  // editor can toggle between states without touching the DB.
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [fading, setFading] = useState(false);

  // Guard against double-triggers when the hook fires multiple UPDATEs
  // in quick succession (Zoho re-fires happen).
  const triggeredRef = useRef(initialUnlocked);

  // React to the hook's `unlocks` array changing — first time it gains
  // our unlock_key, run the transition. Identical behavior to the old
  // inline subscription, just sourced from the shared hook.
  useEffect(() => {
    if (previewState) return;
    if (triggeredRef.current) return;
    if (unlocks.includes(config.unlock_key)) {
      triggeredRef.current = true;
      triggerUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocks, config.unlock_key, previewState]);

  const triggerUnlock = () => {
    if (reduceMotion) {
      setUnlocked(true);
      return;
    }
    setFading(true);
    window.setTimeout(() => {
      setUnlocked(true);
      // fading stays true a bit longer so the unlocked block can mount
      // already faded-in via its own CSS in/out classes.
      window.setTimeout(() => setFading(false), FADE_IN_DELAY_MS + FADE_OUT_MS);
    }, FADE_OUT_MS);
  };

  // Preview override takes priority over real state.
  const effectiveUnlocked =
    previewState === "unlocked" ? true : previewState === "parked" ? false : unlocked;

  return (
    <div className="waiting-renderer">
      {effectiveUnlocked ? (
        <UnlockedView
          config={config}
          templateContext={templateContext}
          onContinue={onContinue}
          mounting={fading}
        />
      ) : (
        <ParkedView
          config={config}
          templateContext={templateContext}
          booking={booking}
          scheduleConfig={scheduleConfig}
          brandShortName={brandShortName}
          advisorName={advisorName}
          onCancelBooking={onCancelBooking}
          onRescheduleNavigate={onRescheduleNavigate}
          leaving={fading}
        />
      )}
    </div>
  );
}

// ---------- parked ----------

function ParkedView({
  config,
  templateContext,
  booking,
  scheduleConfig,
  brandShortName,
  advisorName,
  onCancelBooking,
  onRescheduleNavigate,
  leaving,
}: {
  config: WaitingConfig;
  templateContext: TemplateContext;
  booking: ExistingBooking | null;
  scheduleConfig: ScheduleConfig | null;
  brandShortName: string;
  advisorName: string | null;
  onCancelBooking?: (bookingId: string) => Promise<void>;
  onRescheduleNavigate?: () => void;
  leaving: boolean;
}) {
  return (
    <div
      className={`waiting-parked${leaving ? " is-leaving" : ""}`}
      aria-live="polite"
    >
      <h1 className="waiting-heading">
        {resolveTemplate(config.heading, templateContext)}
      </h1>
      <p className="waiting-subheading">
        {resolveTemplate(config.subheading, templateContext)}
      </p>

      {config.show_booking_details && (
        <BookingDetails
          booking={booking}
          scheduleConfig={scheduleConfig}
          brandShortName={brandShortName}
          advisorName={advisorName}
          onCancelBooking={onCancelBooking}
        />
      )}

      {config.what_happens_next.length > 0 && (
        <div className="waiting-next-section">
          <h3>Here&apos;s what happens next</h3>
          <ul className="waiting-next-list">
            {config.what_happens_next.map((line, i) => (
              <li key={i}>{resolveTemplate(line, templateContext)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="waiting-preview-card">
        <div className="waiting-preview-label">
          {resolveTemplate(config.next_unlock_preview.label, templateContext)}
        </div>
        <p className="waiting-preview-description">
          {resolveTemplate(
            config.next_unlock_preview.description,
            templateContext,
          )}
        </p>
        <p className="waiting-preview-eta">
          {resolveTemplate(config.next_unlock_preview.eta_copy, templateContext)}
        </p>
      </div>

      <p className="waiting-expectation">
        {resolveTemplate(config.expectation_copy, templateContext)}
      </p>

      {/* PR 131: subtle reschedule path. Hidden when there's no booking
          (locked waiting step, pre-book state) or when the parent didn't
          supply the navigation callback. Footer placement keeps the
          waiting step calm — the whole point is "nothing to do here" —
          while still giving candidates who need to reschedule a clear
          path out without backing through the drawer. */}
      {booking && onRescheduleNavigate && (
        <div className="waiting-reschedule-footer">
          <p>
            Need to reschedule?{" "}
            <button
              type="button"
              className="waiting-reschedule-link"
              onClick={onRescheduleNavigate}
            >
              Choose a different time →
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function BookingDetails({
  booking,
  scheduleConfig,
  brandShortName,
  advisorName,
  onCancelBooking,
}: {
  booking: ExistingBooking | null;
  scheduleConfig: ScheduleConfig | null;
  brandShortName: string;
  advisorName: string | null;
  onCancelBooking?: (bookingId: string) => Promise<void>;
}) {
  const [rescheduling, startReschedule] = useTransition();

  if (!booking || !scheduleConfig) {
    return (
      <div className="waiting-booking-empty">
        Your booking details will appear here once your call is on the calendar.
      </div>
    );
  }

  const tz = scheduleConfig.timezone;
  const eventLabel = scheduleConfig.event_label || "Discovery Call";
  const advisorFirstName = advisorName?.split(/\s+/)[0] ?? null;
  const icsTitle = advisorName
    ? `${brandShortName} ${eventLabel} with ${advisorName}`
    : `${brandShortName} ${eventLabel}`;
  const icsFilename = `${eventLabel.toLowerCase().replace(/\s+/g, "-")}.ics`;

  const downloadIcs = () => {
    const ics = buildIcs({
      title: icsTitle,
      description: advisorName
        ? `Your ${eventLabel.toLowerCase()} with ${advisorName} from ${brandShortName}.`
        : `Your ${eventLabel.toLowerCase()} with the ${brandShortName} team.`,
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
    <div className="waiting-booking">
      <div className="waiting-booking-time">
        {formatDayLabel(booking.start_time, tz)} at{" "}
        {formatTimeLabel(booking.start_time, tz)}{" "}
        {formatTzAbbrev(booking.start_time, tz)}
      </div>
      {advisorFirstName && (
        <div className="waiting-booking-with">
          with <strong>{advisorFirstName}</strong> from {brandShortName}
        </div>
      )}
      <div className="waiting-booking-actions">
        <button
          type="button"
          className="slide-nav-btn"
          onClick={downloadIcs}
        >
          Add to calendar
        </button>
        {onCancelBooking && (
          <button
            type="button"
            className="slide-nav-btn"
            disabled={rescheduling}
            onClick={() => {
              if (
                confirm(
                  "Cancel this booking and pick a different time? The event will be removed from everyone's calendars.",
                )
              ) {
                startReschedule(async () => {
                  await onCancelBooking(booking.id);
                });
              }
            }}
          >
            {rescheduling ? "Cancelling…" : "Reschedule"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- unlocked ----------

function UnlockedView({
  config,
  templateContext,
  onContinue,
  mounting,
}: {
  config: WaitingConfig;
  templateContext: TemplateContext;
  onContinue: () => void;
  mounting: boolean;
}) {
  return (
    <div
      className={`waiting-unlocked${mounting ? " is-mounting" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="waiting-unlocked-icon" aria-hidden="true">
        ✨
      </div>
      <h1 className="waiting-heading">
        {resolveTemplate(config.unlocked_heading, templateContext)}
      </h1>
      <button
        type="button"
        className="slide-nav-btn primary waiting-unlocked-cta"
        onClick={onContinue}
      >
        {config.unlocked_cta_label}
      </button>
    </div>
  );
}
