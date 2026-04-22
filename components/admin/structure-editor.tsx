"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChapterFormData } from "@/app/admin/structure/actions";

export interface AdminChapterRow {
  id: string;
  chapter_key: string;
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
  chapters: AdminChapterRow[];
  createChapter: (brandId: string, data: ChapterFormData) => Promise<void>;
  updateChapter: (
    chapterId: string,
    data: Omit<ChapterFormData, "chapter_key">,
  ) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  archiveChapter: (chapterId: string, archived: boolean) => Promise<void>;
  reorderChapters: (brandId: string, orderedChapterIds: string[]) => Promise<void>;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; chapter: AdminChapterRow };

export function StructureEditor({
  brandId,
  brandSlug,
  brandName,
  chapters,
  createChapter,
  updateChapter,
  deleteChapter,
  archiveChapter,
  reorderChapters,
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
    if (target < 0 || target >= chapters.length) return;
    const next = [...chapters];
    const [moved] = next.splice(i, 1);
    next.splice(target, 0, moved);
    run(() => reorderChapters(brandId, next.map((s) => s.id)), "Chapters reordered");
  };

  const handleDelete = (chapter: AdminChapterRow) => {
    if (!confirm(`Delete "${chapter.label}"? This cannot be undone.`)) return;
    run(() => deleteChapter(chapter.id), "Chapter deleted");
  };

  const handleArchive = (chapter: AdminChapterRow) => {
    const next = !chapter.is_archived;
    const msg = next
      ? `Archive "${chapter.label}"? It will be hidden from candidates but preserved here.`
      : `Unarchive "${chapter.label}"?`;
    if (!confirm(msg)) return;
    run(
      () => archiveChapter(chapter.id, next),
      next ? "Chapter archived" : "Chapter unarchived",
    );
  };

  const handleDrawerSave = (
    data: ChapterFormData,
    chapterId: string | null,
  ) => {
    if (chapterId === null) {
      run(() => createChapter(brandId, data), "Chapter added");
    } else {
      const { chapter_key: _unused, ...rest } = data;
      void _unused;
      run(() => updateChapter(chapterId, rest), "Chapter updated");
    }
    setDrawer(null);
  };

  return (
    <div className="admin-page structure-page">
      <header className="structure-head">
        <div>
          <h1 className="admin-h1">Structure</h1>
          <p className="admin-muted">
            Manage the journey for <strong>{brandName}</strong> — chapters here,
            then open a chapter to edit its steps.
          </p>
        </div>
        <button
          type="button"
          className="adm-btn-primary"
          onClick={() => setDrawer({ mode: "create" })}
          disabled={pending}
        >
          + Add chapter
        </button>
      </header>

      {chapters.length === 0 ? (
        <div className="adm-cardlist-empty">
          <p>
            No chapters yet. Add the first chapter to start building the journey.
          </p>
        </div>
      ) : (
        <ul className="structure-chapterlist">
          {chapters.map((chapter, i) => (
            <li
              key={chapter.id}
              className={`structure-chapterrow${chapter.is_archived ? " archived" : ""}`}
            >
              <span className="structure-chapterrow-handle" aria-hidden="true">
                ≡
              </span>
              <span className="structure-chapterrow-num">{i + 1}</span>
              {chapter.icon && (
                <span className="structure-chapterrow-icon">{chapter.icon}</span>
              )}
              <div className="structure-chapterrow-meta">
                <div className="structure-chapterrow-title">
                  <span className="structure-chapterrow-label">{chapter.label}</span>
                  <span className="structure-chapterrow-name">({chapter.name})</span>
                  {chapter.is_archived && (
                    <span className="structure-chip">Archived</span>
                  )}
                </div>
                <div className="structure-chapterrow-sub">
                  <Link
                    href={`/admin/content?brand=${brandSlug}&chapter=${chapter.chapter_key}`}
                    className="structure-chapterrow-steps"
                  >
                    {chapter.step_count === 0
                      ? "0 steps"
                      : `${chapter.step_count} step${chapter.step_count === 1 ? "" : "s"}`}
                    {chapter.step_count_total > chapter.step_count && (
                      <span className="structure-muted">
                        {" "}
                        · {chapter.step_count_total - chapter.step_count} archived
                      </span>
                    )}
                    {" →"}
                  </Link>
                  <span className="structure-muted">· key: {chapter.chapter_key}</span>
                </div>
              </div>
              <div className="structure-chapterrow-reorder">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label="Move chapter up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === chapters.length - 1 || pending}
                  aria-label="Move chapter down"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="structure-chapterrow-actions">
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "edit", chapter })}
                  disabled={pending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => handleArchive(chapter)}
                  disabled={pending}
                  title={
                    chapter.is_archived
                      ? "Unarchive this chapter"
                      : "Hide from candidates without deleting"
                  }
                >
                  {chapter.is_archived ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => handleDelete(chapter)}
                  disabled={pending}
                  title="Permanently delete this chapter"
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
        <ChapterDrawer
          initial={drawer.mode === "edit" ? drawer.chapter : null}
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
  initial: AdminChapterRow | null;
  onCancel: () => void;
  onSave: (data: ChapterFormData, chapterId: string | null) => void;
  saving: boolean;
}

function ChapterDrawer({ initial, onCancel, onSave, saving }: DrawerProps) {
  const isEdit = initial !== null;
  const [form, setForm] = useState<ChapterFormData>(() => ({
    chapter_key: initial?.chapter_key ?? "",
    label: initial?.label ?? "",
    name: initial?.name ?? "",
    icon: initial?.icon ?? null,
    description: initial?.description ?? null,
  }));

  const valid =
    form.label.trim().length > 0 &&
    form.name.trim().length > 0 &&
    (isEdit || /^[a-z][a-z0-9_]*$/.test(form.chapter_key));

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {isEdit ? "Edit" : "Add"} chapter
            </div>
            <h2 className="adm-drawer-title">
              {isEdit ? initial!.label : "New chapter"}
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
              Chapter key{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.chapter_key}
              onChange={(e) =>
                setForm({ ...form, chapter_key: e.target.value.toLowerCase() })
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
              Full chapter name — shown in the step strip header.
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
