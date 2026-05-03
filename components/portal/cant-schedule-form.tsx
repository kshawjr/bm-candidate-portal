"use client";

import { useEffect, useState, useTransition } from "react";

interface Props {
  /** Candidate's email — prefilled but editable. */
  candidateEmail: string;
  /** Server action bound by the parent. Returns success or an error
   *  message to surface inline. */
  onSubmit: (
    email: string,
    availableTimes: string,
    notes: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Display name of the franchise growth leader who'll reach out, used
   *  in success copy. Falls back to "your franchise growth leader". */
  advisorName: string | null;
}

type Phase = "idle" | "open" | "submitted";

/**
 * PR 40: scheduling escape hatch. A small text-button at the bottom of the
 * schedule grid that opens a modal where candidates can describe when they
 * ARE available. Submission writes to booking_unavailable_requests; growth
 * leaders see pending rows on /admin/candidates and reach out manually.
 *
 * The button is intentionally low-key (text-style, not a primary CTA) so it
 * doesn't compete with the booking grid for attention. It's there for the
 * "none of these work" case.
 */
export function CantScheduleForm({
  candidateEmail,
  onSubmit,
  advisorName,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState(candidateEmail);
  const [availableTimes, setAvailableTimes] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-prefill the email if the candidate prop changes (rare but possible
  // after a router refresh that brings updated profile data).
  useEffect(() => {
    if (phase === "idle") setEmail(candidateEmail);
  }, [candidateEmail, phase]);

  // Lock body scroll while the modal is open. Cleanup runs on close +
  // unmount.
  useEffect(() => {
    if (phase === "idle") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  // Auto-close 3s after a successful submit, unless the user already
  // dismissed the modal manually.
  useEffect(() => {
    if (phase !== "submitted") return;
    const t = window.setTimeout(() => setPhase("idle"), 3000);
    return () => window.clearTimeout(t);
  }, [phase]);

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(email, availableTimes, notes);
      if (result.success) {
        setPhase("submitted");
      } else {
        setError(result.error || "Something went wrong. Try again?");
      }
    });
  };

  return (
    <>
      <div className="cant-schedule-trigger-row">
        <button
          type="button"
          className="cant-schedule-trigger"
          onClick={() => setPhase("open")}
        >
          None of these times work?
        </button>
        <span className="cant-schedule-trigger-sub">
          Tell us when works and we&apos;ll reach out
        </span>
      </div>

      {phase !== "idle" && (
        <div
          className="bm-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cant-schedule-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhase("idle");
          }}
        >
          <div className="bm-modal" style={{ width: "min(520px, 100%)" }}>
            <div className="bm-modal-head">
              <div className="bm-modal-head-text">
                <h2
                  id="cant-schedule-heading"
                  className="bm-modal-title"
                >
                  {phase === "submitted" ? "Got it." : "When works for you?"}
                </h2>
                {phase !== "submitted" && (
                  <p className="bm-modal-sub">
                    We&apos;ll get in touch within 1 business day with options.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="bm-modal-close"
                onClick={() => setPhase("idle")}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="bm-modal-body">
              {phase === "submitted" ? (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
                  Thanks. {advisorName ?? "Your franchise growth leader"} will
                  reach out within 1 business day to find a time that works.
                </p>
              ) : (
                <>
                  <label className="bm-modal-field">
                    <span className="bm-modal-label">
                      Email{" "}
                      <span className="bm-modal-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      type="email"
                      className="bm-modal-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>

                  <label className="bm-modal-field">
                    <span className="bm-modal-label">
                      When would work — be specific or general{" "}
                      <span className="bm-modal-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      type="text"
                      className="bm-modal-input"
                      value={availableTimes}
                      onChange={(e) => setAvailableTimes(e.target.value)}
                      placeholder="Weekday mornings, anything after 5pm Eastern, weekends, etc."
                    />
                  </label>

                  <label className="bm-modal-field">
                    <span className="bm-modal-label">
                      Anything else we should know?
                    </span>
                    <textarea
                      className="bm-modal-input"
                      style={{
                        fontFamily: "inherit",
                        minHeight: 80,
                        resize: "vertical",
                      }}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Travel schedule, time zone, partner availability, etc."
                    />
                  </label>

                  {error && <div className="bm-modal-error">{error}</div>}
                </>
              )}
            </div>

            <div className="bm-modal-foot">
              {phase === "submitted" ? (
                <button
                  type="button"
                  className="bm-btn bm-btn-ghost"
                  onClick={() => setPhase("idle")}
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="bm-btn bm-btn-ghost"
                    onClick={() => setPhase("idle")}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="bm-btn"
                    style={{
                      background: "var(--brand-primary, #2563eb)",
                      color: "#fff",
                      border: "none",
                    }}
                    onClick={handleSubmit}
                    disabled={
                      pending ||
                      !email.trim() ||
                      !availableTimes.trim()
                    }
                  >
                    {pending
                      ? "Sending…"
                      : `Send to ${advisorName ?? "your advisor"}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
