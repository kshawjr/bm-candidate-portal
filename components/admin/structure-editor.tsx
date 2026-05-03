"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChapterFormData } from "@/app/admin/structure/actions";
import type {
  ChapterIntroFormData,
  ChapterVideoFormData,
  ChapterCompleteFormData,
} from "@/app/admin/structure/popup-actions";
import {
  ChapterIntroPopup,
  type ChapterIntroPopupConfig,
} from "@/components/portal/chapter-intro-popup";
import {
  ChapterIntroBanner,
  type ChapterIntroBannerConfig,
} from "@/components/portal/chapter-intro-banner";
import {
  ChapterVideoPopup,
  type ChapterVideoConfig,
} from "@/components/portal/chapter-video-popup";
import {
  ChapterCompletePopup,
  type ChapterCompletePopupConfig,
} from "@/components/portal/chapter-complete-popup";
import {
  detectVideoProvider,
  parseVideoSource,
  type VideoProvider,
} from "@/lib/video-source";

export interface ChapterIntroInitial {
  heading: string;
  bodyMd: string;
  heroImageUrl: string | null;
  bullets: Array<{ icon: string; text: string }>;
  ctaDismissLabel: string;
  isActive: boolean;
  showAsBanner: boolean;
}

export interface ChapterVideoInitial {
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
  isActive: boolean;
  updatedAt: string | null;
}

export interface ChapterCompleteInitial {
  heading: string;
  bodyMd: string | null;
  ctaLabel: string;
  isActive: boolean;
}

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
  intro_popup: ChapterIntroInitial | null;
  video: ChapterVideoInitial | null;
  complete_popup: ChapterCompleteInitial | null;
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
  saveChapterIntro: (
    brandId: string,
    chapterKey: string,
    data: ChapterIntroFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterIntro: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uploadChapterIntroHero: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
  saveChapterVideo: (
    brandId: string,
    chapterKey: string,
    data: ChapterVideoFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterVideo: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uploadChapterVideo: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
  saveChapterComplete: (
    brandId: string,
    chapterKey: string,
    data: ChapterCompleteFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterComplete: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; chapter: AdminChapterRow }
  | { mode: "intro"; chapter: AdminChapterRow }
  | { mode: "video"; chapter: AdminChapterRow }
  | { mode: "complete"; chapter: AdminChapterRow };

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
  saveChapterIntro,
  deleteChapterIntro,
  uploadChapterIntroHero,
  saveChapterVideo,
  deleteChapterVideo,
  uploadChapterVideo,
  saveChapterComplete,
  deleteChapterComplete,
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
                  onClick={() => setDrawer({ mode: "video", chapter })}
                  disabled={pending}
                  title="Configure the transition video shown when candidates first enter this chapter"
                >
                  {chapter.video ? "Video ✓" : "Video"}
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "intro", chapter })}
                  disabled={pending}
                  title="Configure the popup shown when candidates first reach this chapter"
                >
                  {chapter.intro_popup ? "Intro popup ✓" : "Intro popup"}
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "complete", chapter })}
                  disabled={pending}
                  title="Configure the celebration popup shown when candidates finish this chapter"
                >
                  {chapter.complete_popup ? "Complete popup ✓" : "Complete popup"}
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

      {drawer &&
        (drawer.mode === "create" || drawer.mode === "edit") && (
          <ChapterDrawer
            initial={drawer.mode === "edit" ? drawer.chapter : null}
            onCancel={() => setDrawer(null)}
            onSave={handleDrawerSave}
            saving={pending}
          />
        )}

      {drawer && drawer.mode === "intro" && (
        <ChapterIntroDrawer
          chapter={drawer.chapter}
          brandId={brandId}
          brandSlug={brandSlug}
          onCancel={() => setDrawer(null)}
          onSaved={(message) => {
            setDrawer(null);
            setToast(message);
            router.refresh();
          }}
          onError={(message) => setError(message)}
          saveChapterIntro={saveChapterIntro}
          deleteChapterIntro={deleteChapterIntro}
          uploadHero={uploadChapterIntroHero}
        />
      )}

      {drawer && drawer.mode === "video" && (
        <ChapterVideoDrawer
          chapter={drawer.chapter}
          brandId={brandId}
          brandSlug={brandSlug}
          onCancel={() => setDrawer(null)}
          onSaved={(message) => {
            setDrawer(null);
            setToast(message);
            router.refresh();
          }}
          onError={(message) => setError(message)}
          saveChapterVideo={saveChapterVideo}
          deleteChapterVideo={deleteChapterVideo}
          uploadVideo={uploadChapterVideo}
        />
      )}

      {drawer && drawer.mode === "complete" && (
        <ChapterCompleteDrawer
          chapter={drawer.chapter}
          brandId={brandId}
          onCancel={() => setDrawer(null)}
          onSaved={(message) => {
            setDrawer(null);
            setToast(message);
            router.refresh();
          }}
          onError={(message) => setError(message)}
          saveChapterComplete={saveChapterComplete}
          deleteChapterComplete={deleteChapterComplete}
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

// ---- chapter intro popup drawer ----

interface ChapterIntroDrawerProps {
  chapter: AdminChapterRow;
  brandId: string;
  brandSlug: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  saveChapterIntro: (
    brandId: string,
    chapterKey: string,
    data: ChapterIntroFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterIntro: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uploadHero: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
}

function ChapterIntroDrawer({
  chapter,
  brandId,
  brandSlug,
  onCancel,
  onSaved,
  onError,
  saveChapterIntro,
  deleteChapterIntro,
  uploadHero,
}: ChapterIntroDrawerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = chapter.intro_popup;
  const [form, setForm] = useState<ChapterIntroFormData>(() => ({
    heading: initial?.heading ?? `Welcome to ${chapter.label}`,
    bodyMd: initial?.bodyMd ?? "",
    heroImageUrl: initial?.heroImageUrl ?? null,
    bullets: initial?.bullets?.length
      ? initial.bullets
      : [{ icon: "✓", text: "" }],
    ctaDismissLabel: initial?.ctaDismissLabel ?? "Let's go",
    isActive: initial?.isActive ?? true,
    showAsBanner: initial?.showAsBanner ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState<"none" | "popup" | "banner">(
    "none",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const valid = form.heading.trim().length > 0 && form.bodyMd.trim().length > 0;

  const handleSave = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await saveChapterIntro(brandId, chapter.chapter_key, form);
      if (result.success) {
        onSaved(`Intro popup saved for ${chapter.label}`);
      } else {
        const msg = result.error || "Save failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the intro popup for "${chapter.label}"? Candidates will no longer see it.`,
      )
    )
      return;
    setLocalError(null);
    startTransition(async () => {
      const result = await deleteChapterIntro(brandId, chapter.chapter_key);
      if (result.success) {
        onSaved(`Intro popup deleted for ${chapter.label}`);
      } else {
        const msg = result.error || "Delete failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const handleHeroFile = (file: File) => {
    setLocalError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await uploadHero(brandSlug, fd);
      setUploading(false);
      if ("url" in result) {
        setForm((f) => ({ ...f, heroImageUrl: result.url }));
      } else {
        setLocalError(result.error || "Upload failed");
      }
    });
  };

  const updateBullet = (
    i: number,
    patch: Partial<{ icon: string; text: string }>,
  ) => {
    setForm((f) => ({
      ...f,
      bullets: f.bullets.map((b, idx) =>
        idx === i ? { ...b, ...patch } : b,
      ),
    }));
  };

  const addBullet = () => {
    setForm((f) => ({
      ...f,
      bullets: [...f.bullets, { icon: "✓", text: "" }],
    }));
  };

  const removeBullet = (i: number) => {
    setForm((f) => ({
      ...f,
      bullets: f.bullets.filter((_, idx) => idx !== i),
    }));
  };

  const cleanedBullets = form.bullets.filter((b) => b.text.trim());
  const popupPreviewConfig: ChapterIntroPopupConfig = {
    chapterKey: chapter.chapter_key,
    heading: form.heading.trim() || "Untitled",
    bodyMd: form.bodyMd,
    heroImageUrl: form.heroImageUrl,
    bullets: cleanedBullets,
    ctaDismissLabel: form.ctaDismissLabel.trim() || "Let's go",
  };
  const bannerPreviewConfig: ChapterIntroBannerConfig = {
    chapterKey: chapter.chapter_key,
    heading: form.heading.trim() || "Untitled",
    bodyMd: form.bodyMd,
    heroImageUrl: form.heroImageUrl,
    bullets: cleanedBullets,
  };

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {initial ? "Edit" : "Add"} chapter intro
            </div>
            <h2 className="adm-drawer-title">{chapter.label}</h2>
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
              placeholder="What to expect in this chapter"
              autoFocus
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">
              Body{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <textarea
              className="adm-textarea"
              rows={5}
              value={form.bodyMd}
              onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
              placeholder="Markdown supported: **bold**, *italic*, [link](url), blank lines for paragraphs."
            />
            <span className="adm-form-hint">
              Supports basic markdown — bold, italic, links, paragraphs.
            </span>
          </label>

          <div className="adm-field">
            <span className="adm-form-label">Hero image</span>
            {form.heroImageUrl ? (
              <div className="adm-upload-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.heroImageUrl} alt="" />
                <div className="adm-upload-preview-body">
                  <div className="adm-upload-preview-actions">
                    <button
                      type="button"
                      className="adm-btn-ghost"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading || pending}
                    >
                      {uploading ? "Uploading…" : "Replace"}
                    </button>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn-danger"
                      onClick={() =>
                        setForm((f) => ({ ...f, heroImageUrl: null }))
                      }
                      disabled={uploading || pending}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="adm-upload-zone"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || pending}
              >
                {uploading ? "Uploading…" : "Click to upload (16:9, optional)"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleHeroFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="adm-field">
            <span className="adm-form-label">Bullets</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.bullets.map((b, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="text"
                    className="adm-input"
                    value={b.icon}
                    onChange={(e) => updateBullet(i, { icon: e.target.value })}
                    placeholder="✓"
                    style={{ width: 60, textAlign: "center" }}
                    maxLength={4}
                  />
                  <input
                    type="text"
                    className="adm-input"
                    value={b.text}
                    onChange={(e) => updateBullet(i, { text: e.target.value })}
                    placeholder="Bullet text"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="adm-icon-btn"
                    onClick={() => removeBullet(i)}
                    aria-label="Remove bullet"
                    title="Remove"
                    disabled={pending}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={addBullet}
                disabled={pending}
                style={{ alignSelf: "flex-start" }}
              >
                + Add bullet
              </button>
            </div>
            <span className="adm-form-hint">
              Icon can be an emoji (✓, ⚡, 🎯) or short text. Empty bullets are
              dropped on save.
            </span>
          </div>

          <label className="adm-field">
            <span className="adm-form-label">Dismiss button label</span>
            <input
              type="text"
              className="adm-input"
              value={form.ctaDismissLabel}
              onChange={(e) =>
                setForm({ ...form, ctaDismissLabel: e.target.value })
              }
              placeholder="Let's go"
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
              Active — show this popup when candidates reach this chapter
            </span>
          </label>

          <label
            className="adm-field"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
          >
            <input
              type="checkbox"
              checked={form.showAsBanner}
              onChange={(e) =>
                setForm({ ...form, showAsBanner: e.target.checked })
              }
              style={{ marginTop: 3 }}
            />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="adm-form-label" style={{ margin: 0 }}>
                Show as persistent banner at top of chapter
              </span>
              <span className="adm-form-hint" style={{ marginTop: 0 }}>
                When on, the same content shows as a banner above the step
                content even after the popup is dismissed.
              </span>
            </span>
          </label>

          {localError && (
            <div className="adm-form-error">{localError}</div>
          )}
        </div>

        <footer className="adm-drawer-foot">
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
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => setPreviewMode("popup")}
              disabled={!valid || pending}
              style={{
                borderRadius: 0,
                borderRight: "1px solid #d1d5db",
                borderTop: "none",
                borderBottom: "none",
                borderLeft: "none",
              }}
              title="Preview as a one-time popup"
            >
              Preview popup
            </button>
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => setPreviewMode("banner")}
              disabled={!valid || pending || !form.showAsBanner}
              style={{
                borderRadius: 0,
                border: "none",
              }}
              title={
                form.showAsBanner
                  ? "Preview the persistent banner"
                  : "Enable 'Show as persistent banner' to preview"
              }
            >
              Preview banner
            </button>
          </div>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={!valid || pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>

      {previewMode === "popup" && (
        <ChapterIntroPopup
          config={popupPreviewConfig}
          onDismiss={async () => ({ success: true })}
          onDismissed={() => setPreviewMode("none")}
        />
      )}

      {previewMode === "banner" && (
        <BannerPreviewOverlay onClose={() => setPreviewMode("none")}>
          <ChapterIntroBanner
            key={`preview-${chapter.chapter_key}`}
            config={bannerPreviewConfig}
          />
        </BannerPreviewOverlay>
      )}
    </div>
  );
}

/**
 * Floats the banner preview in the same kind of overlay the popup uses, so
 * admins can see the banner without leaving the editor. The banner itself
 * is normally rendered inline above step content; this overlay just gives
 * it a neutral surface to render on for preview purposes.
 */
function BannerPreviewOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  // ESC closes the preview. Backdrop click also closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="adm-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ alignItems: "flex-start", paddingTop: 60 }}
    >
      <div
        style={{
          background: "#F6F5F0",
          padding: 24,
          borderRadius: 14,
          width: "min(720px, 100%)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.2)",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6b7280",
            }}
          >
            Banner preview
          </span>
          <button
            type="button"
            className="adm-drawer-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- chapter video drawer ----

interface ChapterVideoDrawerProps {
  chapter: AdminChapterRow;
  brandId: string;
  brandSlug: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  saveChapterVideo: (
    brandId: string,
    chapterKey: string,
    data: ChapterVideoFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterVideo: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
  uploadVideo: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
}

function ChapterVideoDrawer({
  chapter,
  brandId,
  brandSlug,
  onCancel,
  onSaved,
  onError,
  saveChapterVideo,
  deleteChapterVideo,
  uploadVideo,
}: ChapterVideoDrawerProps) {
  const initial = chapter.video;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ChapterVideoFormData>(() => ({
    title: initial?.title ?? `Welcome to ${chapter.label}`,
    videoUrl: initial?.videoUrl ?? "",
    videoProvider: initial?.videoProvider ?? "youtube",
    description: initial?.description ?? "",
    ctaDismissLabel: initial?.ctaDismissLabel ?? "Got it",
    isActive: initial?.isActive ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto-detect provider when admin pastes a URL — same UX as the previous
  // standalone welcome popup editor. Manual override still works.
  const handleUrlChange = (next: string) => {
    setForm((f) => {
      const detected = detectVideoProvider(next);
      return {
        ...f,
        videoUrl: next,
        videoProvider: detected ?? f.videoProvider,
      };
    });
  };

  const handleVideoFile = (file: File) => {
    setLocalError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await uploadVideo(brandSlug, fd);
      setUploading(false);
      if ("url" in result) {
        setForm((f) => ({
          ...f,
          videoUrl: result.url,
          videoProvider: "mp4",
        }));
      } else {
        setLocalError(result.error || "Upload failed");
      }
    });
  };

  const handleSave = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await saveChapterVideo(brandId, chapter.chapter_key, form);
      if (result.success) {
        onSaved(`Transition video saved for ${chapter.label}`);
      } else {
        const msg = result.error || "Save failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the transition video for "${chapter.label}"? Candidates will no longer see it.`,
      )
    )
      return;
    setLocalError(null);
    startTransition(async () => {
      const result = await deleteChapterVideo(brandId, chapter.chapter_key);
      if (result.success) {
        onSaved(`Transition video deleted for ${chapter.label}`);
      } else {
        const msg = result.error || "Delete failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const parsed = parseVideoSource(form.videoUrl);
  const urlValid = parsed !== null;

  const previewConfig: ChapterVideoConfig = {
    chapterKey: chapter.chapter_key,
    title: form.title?.trim() || null,
    videoUrl: form.videoUrl,
    videoProvider: parsed?.provider ?? form.videoProvider,
    description: form.description?.trim() || null,
    ctaDismissLabel: form.ctaDismissLabel.trim() || "Got it",
  };

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {initial ? "Edit" : "Add"} transition video
            </div>
            <h2 className="adm-drawer-title">{chapter.label}</h2>
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
          <p
            className="adm-form-hint"
            style={{ marginTop: 0, marginBottom: 16 }}
          >
            Plays once when a candidate first enters this chapter. They have
            to click the dismiss button — backdrop and ESC don&apos;t close it.
          </p>

          <label className="adm-field">
            <span className="adm-form-label">Title</span>
            <input
              type="text"
              className="adm-input"
              value={form.title ?? ""}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={`Welcome to ${chapter.label}`}
            />
            <span className="adm-form-hint">
              Optional. Shown above the video.
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">
              Video URL{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              className="adm-input"
              value={form.videoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or https://vimeo.com/… or .mp4 URL"
            />
            <span className="adm-form-hint">
              YouTube, Vimeo, or a direct .mp4 URL. Provider is detected
              automatically.
            </span>
            {form.videoUrl && !urlValid && (
              <span className="adm-form-error">
                Couldn&apos;t parse this URL.
              </span>
            )}
          </label>

          <div className="adm-field">
            <span className="adm-form-label">Or upload an mp4</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || pending}
              >
                {uploading ? "Uploading…" : "Choose video file"}
              </button>
              <span className="adm-form-hint" style={{ marginTop: 0 }}>
                MP4 / MOV / WebM, up to 100 MB.
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <label className="adm-field">
            <span className="adm-form-label">Provider</span>
            <select
              className="adm-input"
              value={form.videoProvider}
              onChange={(e) =>
                setForm({
                  ...form,
                  videoProvider: e.target.value as VideoProvider,
                })
              }
            >
              <option value="youtube">YouTube</option>
              <option value="vimeo">Vimeo</option>
              <option value="mp4">Direct mp4</option>
            </select>
            <span className="adm-form-hint">
              Auto-detected from the URL above.
            </span>
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Description</span>
            <textarea
              className="adm-textarea"
              rows={3}
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Optional caption shown below the video."
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Dismiss button label</span>
            <input
              type="text"
              className="adm-input"
              value={form.ctaDismissLabel}
              onChange={(e) =>
                setForm({ ...form, ctaDismissLabel: e.target.value })
              }
              placeholder="Got it"
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
              Active — show this video to candidates entering the chapter
            </span>
          </label>

          {localError && <div className="adm-form-error">{localError}</div>}
        </div>

        <footer className="adm-drawer-foot">
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
            disabled={!urlValid || pending}
          >
            Preview
          </button>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={!urlValid || pending}
          >
            {pending ? "Saving…" : initial ? "Save changes" : "Create video"}
          </button>
        </footer>
      </div>

      {previewOpen && urlValid && (
        <ChapterVideoPopup
          config={previewConfig}
          onDismiss={async () => ({ success: true })}
          onDismissed={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ---- chapter complete drawer ----

interface ChapterCompleteDrawerProps {
  chapter: AdminChapterRow;
  brandId: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  saveChapterComplete: (
    brandId: string,
    chapterKey: string,
    data: ChapterCompleteFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteChapterComplete: (
    brandId: string,
    chapterKey: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

function ChapterCompleteDrawer({
  chapter,
  brandId,
  onCancel,
  onSaved,
  onError,
  saveChapterComplete,
  deleteChapterComplete,
}: ChapterCompleteDrawerProps) {
  const initial = chapter.complete_popup;
  const [form, setForm] = useState<ChapterCompleteFormData>(() => ({
    heading: initial?.heading ?? `${chapter.label} complete!`,
    bodyMd: initial?.bodyMd ?? "",
    ctaLabel: initial?.ctaLabel ?? "Keep going",
    isActive: initial?.isActive ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const valid = form.heading.trim().length > 0;

  const handleSave = () => {
    setLocalError(null);
    startTransition(async () => {
      const result = await saveChapterComplete(
        brandId,
        chapter.chapter_key,
        form,
      );
      if (result.success) {
        onSaved(`Complete popup saved for ${chapter.label}`);
      } else {
        const msg = result.error || "Save failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the complete popup for "${chapter.label}"? Candidates will no longer see the celebration when they finish this chapter.`,
      )
    )
      return;
    setLocalError(null);
    startTransition(async () => {
      const result = await deleteChapterComplete(brandId, chapter.chapter_key);
      if (result.success) {
        onSaved(`Complete popup deleted for ${chapter.label}`);
      } else {
        const msg = result.error || "Delete failed";
        setLocalError(msg);
        onError(msg);
      }
    });
  };

  const previewConfig: ChapterCompletePopupConfig = {
    chapterKey: chapter.chapter_key,
    heading: form.heading.trim() || `${chapter.label} complete`,
    bodyMd: form.bodyMd?.trim() || null,
    ctaLabel: form.ctaLabel.trim() || "Keep going",
  };

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {initial ? "Edit" : "Add"} chapter complete popup
            </div>
            <h2 className="adm-drawer-title">{chapter.label}</h2>
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
          <p
            className="adm-form-hint"
            style={{ marginTop: 0, marginBottom: 16 }}
          >
            Fires when a candidate finishes the last step of this chapter,
            BEFORE current_chapter advances. Confetti animation plays once
            on mount. Click-through dismissal is what advances the candidate
            to the next chapter.
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
              placeholder={`${chapter.label} complete!`}
              autoFocus
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Body</span>
            <textarea
              className="adm-textarea"
              rows={3}
              value={form.bodyMd ?? ""}
              onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
              placeholder="Optional. Markdown supported — bold, italic, links, paragraphs."
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">CTA label</span>
            <input
              type="text"
              className="adm-input"
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              placeholder="Keep going"
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
              Active — fire when candidates finish this chapter
            </span>
          </label>

          {localError && <div className="adm-form-error">{localError}</div>}
        </div>

        <footer className="adm-drawer-foot">
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
            className="adm-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={!valid || pending}
          >
            {pending ? "Saving…" : initial ? "Save changes" : "Create popup"}
          </button>
        </footer>
      </div>

      {previewOpen && (
        <ChapterCompletePopup
          // Re-key per heading so the confetti restarts each time the
          // admin opens the preview to tweak copy.
          key={`preview-${chapter.chapter_key}-${previewConfig.heading}`}
          config={previewConfig}
          onDismiss={async () => ({ success: true })}
          onDismissed={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
