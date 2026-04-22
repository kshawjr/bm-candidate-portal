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
  /** Display name shown in the modal heading to help admins confirm who they're resetting. */
  candidateLabel?: string;
  /** Fires once the modal is dismissed (cancel or success). */
  onClose: () => void;
  /** Fires after a successful reset. Parent typically toasts + refreshes. */
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

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  return (
    <div
      className="adm-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="adm-reset-modal">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">Destructive</div>
            <h2 className="adm-drawer-title">Reset candidate progress</h2>
            {candidateLabel && (
              <p className="adm-muted" style={{ margin: "4px 0 0" }}>
                {candidateLabel}
              </p>
            )}
          </div>
          <button
            type="button"
            className="adm-drawer-close"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="adm-drawer-body">
          <div className="adm-reset-warning">
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

          <label className="adm-field">
            <span className="adm-form-label">
              Type the full token to confirm{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="adm-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={placeholder}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="adm-form-hint">
              Must match exactly. Placeholder shows the first few characters.
            </span>
          </label>

          <label
            className="adm-field"
            style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
          >
            <input
              type="checkbox"
              checked={deleteCalendar}
              onChange={(e) => setDeleteCalendar(e.target.checked)}
              disabled={pending}
              style={{ marginTop: 3 }}
            />
            <span>
              <span className="adm-form-label" style={{ margin: 0 }}>
                Also delete Google Calendar events for this candidate&apos;s
                bookings
              </span>
              <span className="adm-form-hint" style={{ display: "block" }}>
                Deletes the real calendar events from the rep&apos;s Google
                Calendar. Uncheck to keep them (orphaned) for manual cleanup.
              </span>
            </span>
          </label>

          {error && (
            <div className="adm-form-error adm-form-error-inline">{error}</div>
          )}
        </div>

        <footer className="adm-drawer-foot">
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary adm-btn-danger"
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
