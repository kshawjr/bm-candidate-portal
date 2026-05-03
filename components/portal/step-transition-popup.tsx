"use client";

import { useEffect, useState, useTransition } from "react";
import { renderMiniMarkdown } from "@/lib/mini-markdown";

export interface StepTransitionPopupConfig {
  stepId: string;
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
}

interface Props {
  config: StepTransitionPopupConfig;
  /** Auto-dismiss delay in ms. 0 disables the timer. Default 4000. */
  autoDismissMs?: number;
  onDismiss: (stepId: string) => Promise<{ success: boolean }>;
  /** Fires after a successful dismiss so the parent can stop rendering. */
  onDismissed?: () => void;
}

/**
 * Lightweight transition popup that fires when the candidate moves between
 * steps inside a chapter. Toast-positioned (bottom-right), auto-dismisses
 * after 4s, and is one-shot per (candidate, step) thanks to the dismissal
 * tracking on candidates_in_portal.
 *
 * Smaller than the chapter intro popup on purpose — this is a "you've
 * arrived at the next thing" nudge, not an onboarding moment.
 */
export function StepTransitionPopup({
  config,
  autoDismissMs = 4000,
  onDismiss,
  onDismissed,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();

  const triggerDismiss = () => {
    if (pending || closing) return;
    setClosing(true);
    startTransition(async () => {
      const result = await onDismiss(config.stepId);
      // Whether or not the server write succeeded, the candidate has
      // visually dismissed — let the fade-out finish and notify parent.
      // A failed write means the popup may re-fire on next load; that's a
      // small annoyance we'd rather have than a popup that appears stuck.
      void result;
      window.setTimeout(() => {
        onDismissed?.();
      }, 200);
    });
  };

  // Auto-dismiss after the configured delay. Cancelled if the popup is
  // already closing (manual click) or unmounted.
  useEffect(() => {
    if (autoDismissMs <= 0) return;
    const t = window.setTimeout(triggerDismiss, autoDismissMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.stepId, autoDismissMs]);

  // ESC also dismisses for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyHtml = config.bodyMd ? renderMiniMarkdown(config.bodyMd) : "";

  return (
    <div
      className={`step-trans-toast${closing ? " is-closing" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="step-trans-toast-card">
        <button
          type="button"
          className="step-trans-toast-close"
          onClick={triggerDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          disabled={pending}
        >
          <span aria-hidden="true">×</span>
        </button>

        <h3 className="step-trans-toast-heading">{config.heading}</h3>

        {bodyHtml && (
          <div
            className="step-trans-toast-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        )}

        <div className="step-trans-toast-foot">
          <button
            type="button"
            className="step-trans-toast-cta"
            onClick={triggerDismiss}
            disabled={pending}
          >
            {config.ctaLabel}
          </button>
        </div>

        {autoDismissMs > 0 && (
          <div
            className="step-trans-toast-timer"
            style={
              {
                animationDuration: `${autoDismissMs}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
