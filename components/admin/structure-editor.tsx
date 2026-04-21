"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StopFormData } from "@/app/admin/structure/actions";

export interface AdminStopRow {
  id: string;
  stop_key: string;
  position: number;
  label: string;
  name: string;
  icon: string | null;
  description: string | null;
  is_archived: boolean;
  step_count: number;
  step_count_total: number;
}

interface Props {
  brandId: string;
  brandSlug: string;
  brandName: string;
  stops: AdminStopRow[];
  createStop: (brandId: string, data: StopFormData) => Promise<void>;
  updateStop: (
    stopId: string,
    data: Omit<StopFormData, "stop_key">,
  ) => Promise<void>;
  deleteStop: (stopId: string) => Promise<void>;
  archiveStop: (stopId: string, archived: boolean) => Promise<void>;
  reorderStops: (brandId: string, orderedStopIds: string[]) => Promise<void>;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; stop: AdminStopRow };

export function StructureEditor({
  brandId,
  brandSlug,
  brandName,
  stops,
  createStop,
  updateStop,
  deleteStop,
  archiveStop,
  reorderStops,
}: Props) {
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
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    const [moved] = next.splice(i, 1);
    next.splice(target, 0, moved);
    run(() => reorderStops(brandId, next.map((s) => s.id)), "Stops reordered");
  };

  const handleDelete = (stop: AdminStopRow) => {
    if (!confirm(`Delete "${stop.label}"? This cannot be undone.`)) return;
    run(() => deleteStop(stop.id), "Stop deleted");
  };

  const handleArchive = (stop: AdminStopRow) => {
    const next = !stop.is_archived;
    const msg = next
      ? `Archive "${stop.label}"? It will be hidden from candidates but preserved here.`
      : `Unarchive "${stop.label}"?`;
    if (!confirm(msg)) return;
    run(
      () => archiveStop(stop.id, next),
      next ? "Stop archived" : "Stop unarchived",
    );
  };

  const handleDrawerSave = (
    data: StopFormData,
    stopId: string | null,
  ) => {
    if (stopId === null) {
      run(() => createStop(brandId, data), "Stop added");
    } else {
      const { stop_key: _unused, ...rest } = data;
      void _unused;
      run(() => updateStop(stopId, rest), "Stop updated");
    }
    setDrawer(null);
  };

  return (
    <div className="admin-page structure-page">
      <header className="structure-head">
        <div>
          <h1 className="admin-h1">Structure</h1>
          <p className="admin-muted">
            Manage the journey for <strong>{brandName}</strong> — stops here,
            then open a stop to edit its steps.
          </p>
        </div>
        <button
          type="button"
          className="adm-btn-primary"
          onClick={() => setDrawer({ mode: "create" })}
          disabled={pending}
        >
          + Add stop
        </button>
      </header>

      {stops.length === 0 ? (
        <div className="adm-cardlist-empty">
          <p>
            No stops yet. Add the first stop to start building the journey.
          </p>
        </div>
      ) : (
        <ul className="structure-stoplist">
          {stops.map((stop, i) => (
            <li
              key={stop.id}
              className={`structure-stoprow${stop.is_archived ? " archived" : ""}`}
            >
              <span className="structure-stoprow-handle" aria-hidden="true">
                ≡
              </span>
              <span className="structure-stoprow-num">{i + 1}</span>
              {stop.icon && (
                <span className="structure-stoprow-icon">{stop.icon}</span>
              )}
              <div className="structure-stoprow-meta">
                <div className="structure-stoprow-title">
                  <span className="structure-stoprow-label">{stop.label}</span>
                  <span className="structure-stoprow-name">({stop.name})</span>
                  {stop.is_archived && (
                    <span className="structure-chip">Archived</span>
                  )}
                </div>
                <div className="structure-stoprow-sub">
                  <Link
                    href={`/admin/content?brand=${brandSlug}&stop=${stop.stop_key}`}
                    className="structure-stoprow-steps"
                  >
                    {stop.step_count === 0
                      ? "0 steps"
                      : `${stop.step_count} step${stop.step_count === 1 ? "" : "s"}`}
                    {stop.step_count_total > stop.step_count && (
                      <span className="structure-muted">
                        {" "}
                        · {stop.step_count_total - stop.step_count} archived
                      </span>
                    )}
                    {" →"}
                  </Link>
                  <span className="structure-muted">· key: {stop.stop_key}</span>
                </div>
              </div>
              <div className="structure-stoprow-reorder">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label="Move stop up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === stops.length - 1 || pending}
                  aria-label="Move stop down"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="structure-stoprow-actions">
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "edit", stop })}
                  disabled={pending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => handleArchive(stop)}
                  disabled={pending}
                  title={
                    stop.is_archived
                      ? "Unarchive this stop"
                      : "Hide from candidates without deleting"
                  }
                >
                  {stop.is_archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => handleDelete(stop)}
                  disabled={pending}
                  title="Permanently delete this stop"
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
        <StopDrawer
          initial={drawer.mode === "edit" ? drawer.stop : null}
          onCancel={() => setDrawer(null)}
          onSave={handleDrawerSave}
          saving={pending}
        />
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}

// ---- drawer ----

interface DrawerProps {
  initial: AdminStopRow | null;
  onCancel: () => void;
  onSave: (data: StopFormData, stopId: string | null) => void;
  saving: boolean;
}

function StopDrawer({ initial, onCancel, onSave, saving }: DrawerProps) {
  const isEdit = initial !== null;
  const [form, setForm] = useState<StopFormData>(() => ({
    stop_key: initial?.stop_key ?? "",
    label: initial?.label ?? "",
    name: initial?.name ?? "",
    icon: initial?.icon ?? null,
    description: initial?.description ?? null,
  }));

  const valid =
    form.label.trim().length > 0 &&
    form.name.trim().length > 0 &&
    (isEdit || /^[a-z][a-z0-9_]*$/.test(form.stop_key));

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {isEdit ? "Edit" : "Add"} stop
            </div>
            <h2 className="adm-drawer-title">
              {isEdit ? initial!.label : "New stop"}
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
              Stop key{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.stop_key}
              onChange={(e) =>
                setForm({ ...form, stop_key: e.target.value.toLowerCase() })
              }
              placeholder="first_chat"
              disabled={isEdit}
              autoFocus={!isEdit}
            />
            <span className="adm-form-hint">
              {isEdit
                ? "Key is fixed once created — used as a stable reference across brands."
                : "Lowercase letters, numbers, underscores. Cannot change after save."}
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
              placeholder="Say hi"
            />
            <span className="adm-form-hint">
              Short, friendly — shown in the candidate sidebar.
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">
              Name{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Discovery call"
            />
            <span className="adm-form-hint">
              Full stop name — shown in the step strip header.
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Icon</span>
            <input
              type="text"
              className="adm-input"
              value={form.icon ?? ""}
              onChange={(e) =>
                setForm({ ...form, icon: e.target.value || null })
              }
              placeholder="📞"
              maxLength={4}
            />
            <span className="adm-form-hint">
              Optional emoji shown next to the label in the sidebar.
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Description</span>
            <textarea
              className="adm-textarea"
              rows={3}
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value || null })
              }
              placeholder="Internal note — not shown to candidates"
            />
          </label>
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
            onClick={() => onSave(form, initial?.id ?? null)}
            disabled={!valid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
