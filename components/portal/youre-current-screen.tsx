"use client";

import type { Chapter } from "@/components/cinematic-shell";
import type { ExistingBooking } from "@/components/content-types/schedule-renderer";

interface Props {
  /** The chapter the candidate is currently on (the locked / no-steps
   *  one). Used for the "Chapter N will unlock..." copy. */
  currentChapter: Chapter;
  currentChapterNumber: number;
  /** The chapter the candidate just completed. Used for the celebratory
   *  heading. Null when the candidate landed on a locked chapter without
   *  finishing a previous one (edge case — first chapter is locked). */
  previousChapter: Chapter | null;
  previousChapterNumber: number | null;
  /** Optional most-recent booking. When present, summarises in the card
   *  so the candidate knows the call is on the calendar. */
  booking: ExistingBooking | null;
  /** Friendly time + day strings derived server-side from the booking
   *  start_time. Provided as strings to avoid pulling a date library
   *  into the client. */
  bookingDayLabel: string | null;
  bookingTimeLabel: string | null;
  /** Display name of the franchise growth leader, used in the holding
   *  copy ("X will be in touch..."). */
  advisorName: string | null;
}

/**
 * PR 44: holding card shown when the candidate's current chapter has no
 * active steps. Generalised from the post-booking pattern in PR 30/35.
 *
 * Two messages stack:
 *   1. Celebrate the chapter just finished ("You've completed Chapter 2")
 *      with booking details if applicable.
 *   2. Frame what's next as "coming soon" so the candidate knows the
 *      portal is intentionally pausing here, not broken.
 */
export function YoureCurrentScreen({
  currentChapter,
  currentChapterNumber,
  previousChapter,
  previousChapterNumber,
  booking,
  bookingDayLabel,
  bookingTimeLabel,
  advisorName,
}: Props) {
  return (
    <div className="youre-current">
      <div className="youre-current-icon" aria-hidden="true">
        ✓
      </div>
      <h2 className="youre-current-heading">
        {previousChapter
          ? `You've completed Chapter ${previousChapterNumber}.`
          : "You're all set."}
      </h2>
      {previousChapter && (
        <p className="youre-current-sub">
          {previousChapter.name}
        </p>
      )}

      {booking && (
        <div className="youre-current-booking">
          <div className="youre-current-booking-eyebrow">
            On the calendar
          </div>
          <div className="youre-current-booking-when">
            {bookingDayLabel ?? "Your call"}
            {bookingTimeLabel ? ` at ${bookingTimeLabel}` : null}
          </div>
          <p className="youre-current-booking-meta">
            A calendar invite with the Google Meet link is in your inbox.
            {advisorName ? ` ${advisorName} will be there.` : null}
          </p>
        </div>
      )}

      <div className="youre-current-holding">
        <div className="youre-current-holding-eyebrow">
          Chapter {currentChapterNumber} · {currentChapter.label}
        </div>
        <h3 className="youre-current-holding-heading">Coming soon</h3>
        <p className="youre-current-holding-body">
          {booking
            ? "We'll unlock the next part of the journey after we connect on the call."
            : `${currentChapter.name} unlocks once your franchise growth leader gives the go-ahead.`}
        </p>
      </div>
    </div>
  );
}
