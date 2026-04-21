"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  ContentType,
  StepFormData,
} from "@/app/admin/structure/actions";

export interface AdminStepRow {
  id: string;
  step_key: string;
  position: number;
  label: string;
  description: string | null;
  content_type: string;
  is_archived: boolean;
}

const CONTENT_TYPE_OPTIONS: Array<{
  value: ContentType;
  label: string;
  description: string;
  disabled: boolean;
}> = [
  {
    value: "slides",
    label: "Slides",
    description: "Image-based slides with prev/next and caption.",
    disabled: false,
  },
  {
    value: "application",
    label: "Application",
    description: "The 14-screen light application form.",
    disabled: false,
  },
  {
    value: "static",
    label: "Static",
    description: "Static text content with optional hero.",
    disabled: false,
  },
  {
    value: "video",
    label: "Video",
    description: "Embedded video player (coming soon).",
    disabled: true,
  },
  {
    value: "document",
    label: "Document",
    description: "Long-form document like the FDD (coming soon).",
    disabled: true,
  },
  {
    value: "checklist",
    label: "Checklist",
    description: "Items the candidate completes (coming soon).",
    disabled: true,
  },
  {
    value: "schedule",
    label: "Schedule",
    description: "Calendar booking widget (coming soon).",
    disabled: true,
  },
];

const CONTENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

interface Props {
  brandId: string;
  brandSlug: string;
  stopKey: string;
  stopLabel: string;
  stopName: string;
  stopNumber: number;
  steps: AdminStepRow[];
  onSelectStep: (stepId: string) => void;
  createStep: (
    brandId: string,
    stopKey: string,
    data: StepFormData,
  ) => Promise<string>;
  updateStep: (
    stepId: string,
    data: Omit<StepFormData, "step_key"> & { confirmTypeReset?: boolean },
  ) => Promise<void>;
  deleteStep: (stepId: string) => Promise<void>;
  archiveStep: (stepId: string, archived: boolean) => Promise<void>;
  reorderSteps: (
    brandId: string,
    stopKey: string,
    orderedStepIds: string[],
  ) => Promise<void>;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; step: AdminStepRow };

export function StepsManager({
  brandId,
  brandSlug: _brandSlug,
  stopKey,
  stopLabel,
  stopName,
  stopNumber,
  steps,
  onSelectStep,
  createStep,
  updateStep,
  deleteStep,
  archiveStep,
  reorderSteps,
}: Props) {
  void _brandSlug;
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (fn: () => Promise<void>, successMessage: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setToast(successMessage);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  };

  const handleMove = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(i, 1);
    next.splice(target, 0, moved);
    run(
      () => reorderSteps(brandId, stopKey, next.map((s) => s.id)),
      "Steps reordered",
    );
  };

  const handleDelete = (step: AdminStepRow) => {
    if (!confirm(`Delete "${step.label}"? This cannot be undone.`)) return;
    run(() => deleteStep(step.id), "Step deleted");
  };

  const handleArchive = (step: AdminStepRow) => {
    const next = !step.is_archived;
    const msg = next
      ? `Archive "${step.label}"? It will be hidden from candidates.`
      : `Unarchive "${step.label}"?`;
    if (!confirm(msg)) return;
    run(
      () => archiveStep(step.id, next),
      next ? "Step archived" : "Step unarchived",
    );
  };

  const handleDrawerSave = async (
    data: StepFormData,
    stepId: string | null,
    confirmTypeReset: boolean,
  ) => {
    if (stepId === null) {
      setError(null);
      startTransition(async () => {
        try {
          const newId = await createStep(brandId, stopKey, data);
          setToast("Step added");
          setDrawer(null);
          router.refresh();
          onSelectStep(newId);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Create failed");
        }
      });
    } else {
      const { step_key: _sk, ...rest } = data;
      void _sk;
      run(
        () => updateStep(stepId, { ...rest, confirmTypeReset }),
        "Step updated",
      );
      setDrawer(null);
    }
  };

  return (
    <>
      <header className="adm-editor-head">
        <div>
          <div className="adm-editor-eyebrow">
            Stop {stopNumber} · {stopName}
          </div>
          <h1 className="adm-editor-title">{stopLabel}</h1>
          <p className="adm-editor-desc">
            Manage the steps inside this stop. Open a step to edit its
            content.
          </p>
        </div>
        <button
          type="button"
          className="adm-btn-primary"
          onClick={() => setDrawer({ mode: "create" })}
          disabled={pending}
        >
          + Add step
        </button>
      </header>

      {steps.length === 0 ? (
        <div className="adm-cardlist-empty">
          <p>No steps in this stop yet. Add the first one to get started.</p>
        </div>
      ) : (
        <ul className="structure-steplist">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={`structure-steprow${step.is_archived ? " archived" : ""}`}
            >
              <span className="structure-stoprow-num">{i + 1}</span>
              <div className="structure-stoprow-meta">
                <div className="structure-stoprow-title">
                  <span className="structure-stoprow-label">{step.label}</span>
                  <span className="structure-steprow-type">
                    {CONTENT_TYPE_LABEL[step.content_type] ??
                      step.content_type}
                  </span>
                  {step.is_archived && (
                    <span className="structure-chip">Archived</span>
                  )}
                </div>
                {step.description && (
                  <div className="structure-stoprow-sub">
                    <span className="structure-muted">{step.description}</span>
                  </div>
                )}
              </div>
              <div className="structure-stoprow-reorder">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label="Move step up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === steps.length - 1 || pending}
                  aria-label="Move step down"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="structure-stoprow-actions">
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => onSelectStep(step.id)}
                  disabled={pending}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "edit", step })}
                  disabled={pending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => handleArchive(step)}
                  disabled={pending}
                >
                  {step.is_archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => handleDelete(step)}
                  disabled={pending}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="adm-form-error adm-form-error-inline">{error}</div>
      )}

      {drawer && (
        <StepDrawer
          initial={drawer.mode === "edit" ? drawer.step : null}
          onCancel={() => setDrawer(null)}
          onSave={handleDrawerSave}
          saving={pending}
        />
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </>
  );
}

// ---- drawer ----

interface DrawerProps {
  initial: AdminStepRow | null;
  onCancel: () => void;
  onSave: (
    data: StepFormData,
    stepId: string | null,
    confirmTypeReset: boolean,
  ) => void;
  saving: boolean;
}

function StepDrawer({ initial, onCancel, onSave, saving }: DrawerProps) {
  const isEdit = initial !== null;
  const [form, setForm] = useState<StepFormData>(() => ({
    step_key: initial?.step_key ?? "",
    label: initial?.label ?? "",
    description: initial?.description ?? null,
    content_type: (initial?.content_type as ContentType) ?? "static",
  }));

  const valid =
    form.label.trim().length > 0 &&
    (isEdit || /^[a-z][a-z0-9_]*$/.test(form.step_key));
  const typeChanged =
    isEdit && initial!.content_type !== form.content_type;

  const handleSaveClick = () => {
    if (!valid) return;
    if (typeChanged) {
      const ok = confirm(
        "Changing the content type will reset this step's content. Any existing data (slides, cards, body text) will be lost. Continue?",
      );
      if (!ok) return;
      onSave(form, initial!.id, true);
      return;
    }
    onSave(form, initial?.id ?? null, false);
  };

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {isEdit ? "Edit" : "Add"} step
            </div>
            <h2 className="adm-drawer-title">
              {isEdit ? initial!.label : "New step"}
            </h2>
          </div>
          <button
            type="button"
            className="adm-drawer-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="adm-drawer-body">
          <label className="adm-field">
            <span className="adm-form-label">
              Step key{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.step_key}
              onChange={(e) =>
                setForm({ ...form, step_key: e.target.value.toLowerCase() })
              }
              placeholder="brand_tour"
              disabled={isEdit}
              autoFocus={!isEdit}
            />
            <span className="adm-form-hint">
              {isEdit
                ? "Key is fixed once created."
                : "Lowercase letters, numbers, underscores."}
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">
              Label{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Brand tour"
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Description</span>
            <input
              type="text"
              className="adm-input"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value || null })
              }
              placeholder="Internal note — optional"
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">
              Content type{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <select
              className="adm-input"
              value={form.content_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  content_type: e.target.value as ContentType,
                })
              }
            >
              {CONTENT_TYPE_OPTIONS.map((opt) => (
                <option
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                >
                  {opt.label}
                  {opt.disabled ? " (coming soon)" : ""}
                </option>
              ))}
            </select>
            <span className="adm-form-hint">
              {CONTENT_TYPE_OPTIONS.find((o) => o.value === form.content_type)
                ?.description ?? ""}
            </span>
          </label>

          {typeChanged && (
            <div className="adm-form-error adm-form-error-inline">
              Changing type will reset this step&apos;s content. You&apos;ll
              be asked to confirm.
            </div>
          )}
        </div>

        <footer className="adm-drawer-foot">
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSaveClick}
            disabled={!valid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
