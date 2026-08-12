"use client";

import { useEffect, useState, useTransition } from "react";
import { OPT_OUT_REASONS, type OptOutReason } from "@/lib/opt-out";

interface Props {
  onCancel: () => void;
  onConfirm: (reason: OptOutReason) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Two-step opt-out modal. Step 1 is a confirm dialog (candidate can back
 * out); step 2 collects the reason. Step 2 requires an explicit reason
 * choice — backdrop / ESC dismisses only from step 1 so a mis-tap on the
 * reason screen doesn't drop the candidate out of the flow entirely.
 */
export function OptOutModal({ onCancel, onConfirm }: Props) {
  const [step, setStep] = useState<"confirm" | "reason">("confirm");
  const [selectedReason, setSelectedReason] = useState<OptOutReason | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC closes only from the confirm step. The reason step requires the
  // candidate to either pick or explicitly Cancel — matches how forms
  // that ask for a reason typically feel.
  useEffect(() => {
    if (step !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onCancel]);

  const handleConfirmClick = () => {
    if (!selectedReason) return;
    setError(null);
    startTransition(async () => {
      const result = await onConfirm(selectedReason);
      if (!result.success) {
        setError(result.error ?? "Something went wrong. Try again.");
      }
      // Success: parent revalidates + unmounts this component when the
      // page re-renders with the locked screen. No local close needed.
    });
  };

  return (
    <div
      className="pp-popup-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opt-out-title"
      onClick={(e) => {
        // Backdrop-click dismiss only from the confirm step, same
        // rationale as ESC above.
        if (step === "confirm" && e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="pp-popup" style={{ width: "min(480px, 100%)" }}>
        {step === "confirm" ? (
          <>
            <h2 id="opt-out-title" className="pp-popup-title">
              Not interested in this opportunity?
            </h2>
            <p className="pp-popup-desc">
              We&apos;ll close out your portal and let your franchise
              development team know. You can always reconnect later if
              things change.
            </p>
            <div
              className="pp-popup-foot"
              style={{ gap: 12, justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="pp-popup-cta"
                onClick={onCancel}
                style={{
                  background: "transparent",
                  color: "#4b5563",
                  border: "1px solid #d1d5db",
                }}
              >
                Never mind
              </button>
              <button
                type="button"
                className="pp-popup-cta"
                onClick={() => setStep("reason")}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="opt-out-title" className="pp-popup-title">
              What&apos;s the main reason?
            </h2>
            <p className="pp-popup-desc">
              This helps your franchise development team follow up in a
              way that respects your time.
            </p>
            <div
              className="pp-popup-body"
              style={{ padding: "18px 28px 0" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {OPT_OUT_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason;
                  return (
                    <label
                      key={reason}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        border: `1px solid ${isSelected ? "var(--brand-primary, #2563eb)" : "#e5e7eb"}`,
                        borderRadius: 10,
                        cursor: "pointer",
                        background: isSelected
                          ? "color-mix(in srgb, var(--brand-primary, #2563eb) 6%, transparent)"
                          : "#ffffff",
                        transition: "border-color 0.12s, background 0.12s",
                      }}
                    >
                      <input
                        type="radio"
                        name="opt-out-reason"
                        value={reason}
                        checked={isSelected}
                        onChange={() => setSelectedReason(reason)}
                        style={{
                          accentColor: "var(--brand-primary, #2563eb)",
                          width: 16,
                          height: 16,
                        }}
                      />
                      <span style={{ fontSize: 15, color: "#111827" }}>
                        {reason}
                      </span>
                    </label>
                  );
                })}
              </div>
              {error && (
                <p
                  role="alert"
                  style={{
                    marginTop: 14,
                    color: "#b91c1c",
                    fontSize: 13,
                  }}
                >
                  {error}
                </p>
              )}
            </div>
            <div
              className="pp-popup-foot"
              style={{ gap: 12, justifyContent: "space-between" }}
            >
              <button
                type="button"
                className="pp-popup-cta"
                onClick={onCancel}
                disabled={pending}
                style={{
                  background: "transparent",
                  color: "#4b5563",
                  border: "1px solid #d1d5db",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pp-popup-cta"
                onClick={handleConfirmClick}
                disabled={pending || !selectedReason}
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
