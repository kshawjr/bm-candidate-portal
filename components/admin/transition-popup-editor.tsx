"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StepTransitionPopup,
  type StepTransitionPopupConfig,
} from "@/components/portal/step-transition-popup";
import type { StepTransitionFormData } from "@/app/admin/content/transition-actions";

export interface TransitionPopupInitial {
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
  isActive: boolean;
}

interface Props {
  stepId: string;
  stepLabel: string;
  initial: TransitionPopupInitial | null;
  onSave: (
    stepId: string,
    data: StepTransitionFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  onDelete: (stepId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Inline editor for a step's transition popup. Shown alongside the step's
 * content editor on /admin/content so admins can configure the toast that
 * fires when a candidate first lands on this step.
 *
 * Lives in a collapsed panel by default — click the header to expand.
 * Avoids competing for visual real estate with the main content editor.
 */
export function TransitionPopupEditor({
  stepId,
  stepLabel,
  initial,
  onSave,
  onDelete,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(initial !== null);
  const [form, setForm] = useState<StepTransitionFormData>(() => ({
    heading: initial?.heading ?? `On to ${stepLabel}`,
    bodyMd: initial?.bodyMd ?? "",
    ctaLabel: initial?.ctaLabel ?? "Continue",
    isActive: initial?.isActive ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSave(stepId, form);
      if (result.success) {
        setToast("Transition popup saved");
        router.refresh();
      } else {
        setError(result.error || "Save failed");
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the transition popup for "${stepLabel}"? Candidates will no longer see it.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await onDelete(stepId);
      if (result.success) {
        setToast("Transition popup deleted");
        // Reset the form to the empty defaults so the panel reflects the
        // deleted state without requiring a full page reload.
        setForm({
          heading: `On to ${stepLabel}`,
          bodyMd: "",
          ctaLabel: "Continue",
          isActive: true,
        });
        router.refresh();
      } else {
        setError(result.error || "Delete failed");
      }
    });
  };

  const valid = form.heading.trim().length > 0;

  const previewConfig: StepTransitionPopupConfig = {
    stepId,
    heading: form.heading.trim() || stepLabel,
    bodyMd: form.bodyMd?.trim() || null,
    ctaLabel: form.ctaLabel.trim() || "Continue",
  };

  return (
    <section className="adm-cards-section" style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          padding: "10px 0",
          cursor: "pointer",
          font: "inherit",
        }}
        aria-expanded={open}
      >
        <span className="adm-cards-section-eyebrow" style={{ margin: 0 }}>
          Transition popup{" "}
          {initial && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: "#10b981",
                fontWeight: 600,
              }}
            >
              ✓ configured
            </span>
          )}
        </span>
        <span aria-hidden="true" style={{ fontSize: 16, color: "#6b7280" }}>
          {open ? "−" : "+"}
        </span>
      </button>

      {!open && (
        <p
          className="adm-form-hint"
          style={{ margin: "0 0 4px", fontSize: 13 }}
        >
          A small toast that fires when a candidate first lands on this step.
        </p>
      )}

      {open && (
        <div className="adm-card" style={{ padding: 20, marginTop: 12 }}>
          <p
            className="adm-form-hint"
            style={{ marginTop: 0, marginBottom: 16 }}
          >
            Shown bottom-right when a candidate moves to this step. Auto-dismisses
            after 4 seconds. Each candidate sees it at most once.
          </p>

          <label className="adm-field">
            <span className="adm-form-label">
              Heading{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.heading}
              onChange={(e) => setForm({ ...form, heading: e.target.value })}
              placeholder="Great — now the application"
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Body</span>
            <textarea
              className="adm-textarea"
              rows={3}
              value={form.bodyMd ?? ""}
              onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
              placeholder="Optional — a sentence or two of context. Markdown supported."
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">CTA label</span>
            <input
              type="text"
              className="adm-input"
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              placeholder="Continue"
            />
          </label>

          <label
            className="adm-field"
            style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
            />
            <span className="adm-form-label" style={{ margin: 0 }}>
              Active — fire when a candidate lands on this step
            </span>
          </label>

          {error && <div className="adm-form-error">{error}</div>}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 16,
              flexWrap: "wrap",
            }}
          >
            {initial && (
              <button
                type="button"
                className="adm-btn-ghost adm-btn-danger"
                onClick={handleDelete}
                disabled={pending}
                style={{ marginRight: "auto" }}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => setPreviewOpen(true)}
              disabled={!valid || pending}
            >
              Preview
            </button>
            <button
              type="button"
              className="adm-btn-primary"
              onClick={handleSave}
              disabled={!valid || pending}
            >
              {pending ? "Saving…" : initial ? "Save changes" : "Create popup"}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="adm-toast">{toast}</div>}

      {previewOpen && (
        <StepTransitionPopup
          // Re-key per heading so each preview restarts the auto-dismiss timer.
          key={`${stepId}-${previewConfig.heading}`}
          config={previewConfig}
          autoDismissMs={6000}
          onDismiss={async () => ({ success: true })}
          onDismissed={() => setPreviewOpen(false)}
        />
      )}
    </section>
  );
}
