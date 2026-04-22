"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetCandidateAction,
  type ResetCounts,
  type ResetResult,
} from "@/app/admin/candidates/actions";

interface Props {
  /** The candidate's token — required; used to match the confirm input. */
  token: string;
  /** Optional label shown below the modal title (e.g. candidate name + brand). */
  candidateLabel?: string;
  /** Fires when the modal is dismissed (cancel, Escape, backdrop click, or success). */
  onClose: () => void;
  /** Fires after a successful reset with the delete counts. */
  onSuccess?: (counts: ResetCounts) => void;
}

function summarizeCounts(c: ResetCounts): string {
  const parts: string[] = [];
  parts.push(`${c.responses_deleted} response${c.responses_deleted === 1 ? "" : "s"}`);
  parts.push(`${c.progress_deleted} progress row${c.progress_deleted === 1 ? "" : "s"}`);
  parts.push(`${c.bookings_deleted} booking${c.bookings_deleted === 1 ? "" : "s"}`);
  if (c.calendar_events_deleted > 0) {
    parts.push(
      `${c.calendar_events_deleted} calendar event${c.calendar_events_deleted === 1 ? "" : "s"}`,
    );
  }
  return `Reset complete: ${parts.join(", ")} deleted.`;
}

export function ResetCandidateModal({
  token,
  candidateLabel,
  onClose,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [confirmInput, setConfirmInput] = useState("");
  const [deleteCalendar, setDeleteCalendar] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the input on mount so admins can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape — but only when idle, so admins don't accidentally
  // dismiss mid-reset and lose the server result.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  const matches = confirmInput === token;
  const placeholder =
    token.length <= 4 ? token : `${token.slice(0, 4)}…`;

  const handleReset = () => {
    setError(null);
    startTransition(async () => {
      let result: ResetResult;
      try {
        result = await resetCandidateAction({
          token,
          confirmToken: confirmInput,
          deleteCalendarEvents: deleteCalendar,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reset failed");
        return;
      }
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSuccess?.(result.counts);
      router.refresh();
      onClose();
    });
  };

  const checkboxId = "bm-modal-delete-calendar";

  return (
    <div
      className="bm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bm-modal">
        <header className="bm-modal-head">
          <div className="bm-modal-head-text">
            <span className="bm-modal-chip">Destructive</span>
            <h2 className="bm-modal-title" id="bm-modal-title">
              Reset candidate progress
            </h2>
            {candidateLabel && <p className="bm-modal-sub">{candidateLabel}</p>}
          </div>
          <button
            type="button"
            className="bm-modal-close"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="bm-modal-body">
          <div className="bm-modal-warning">
            <p>
              <strong>This will permanently delete:</strong>
            </p>
            <ul>
              <li>All application form responses</li>
              <li>All step-completion progress rows</li>
              <li>All bookings (DB rows)</li>
            </ul>
            <p>
              The candidate returns to <strong>Chapter 1 · Step 1</strong> with
              a clean slate. Cannot be undone.
            </p>
          </div>

          <label className="bm-modal-field">
            <span className="bm-modal-label">
              Type the full token to confirm
              <span className="bm-modal-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="bm-modal-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={placeholder}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="bm-modal-hint">
              Must match exactly. Placeholder shows the first few characters.
            </span>
          </label>

          <div className="bm-modal-field bm-modal-checkbox">
            <input
              id={checkboxId}
              type="checkbox"
              checked={deleteCalendar}
              onChange={(e) => setDeleteCalendar(e.target.checked)}
              disabled={pending}
            />
            <span className="bm-modal-checkbox-text">
              <label htmlFor={checkboxId} className="bm-modal-label">
                Also delete Google Calendar events for this candidate&apos;s
                bookings
              </label>
              <span className="bm-modal-hint">
                Deletes the real calendar events from the rep&apos;s Google
                Calendar. Uncheck to keep them (orphaned) for manual cleanup.
              </span>
            </span>
          </div>

          {error && <div className="bm-modal-error">{error}</div>}
        </div>

        <footer className="bm-modal-foot">
          <button
            type="button"
            className="bm-btn bm-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="bm-btn bm-btn-danger"
            onClick={handleReset}
            disabled={!matches || pending}
          >
            {pending ? "Resetting…" : "Reset candidate"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export { summarizeCounts };
