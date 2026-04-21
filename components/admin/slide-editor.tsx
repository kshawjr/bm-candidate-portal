"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Slide } from "@/components/content-types/slides-renderer";
import { ImageUpload } from "./image-upload";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

interface Props {
  brandSlug: string;
  stepId: string;
  initialSlides: Slide[];
  saveSlides: (stepId: string, slides: Slide[]) => Promise<void>;
  upload: UploadFn;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; index: number };

function newSlide(): Slide {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    image_url: "",
    alt: null,
    caption: null,
  };
}

export function SlideEditor({
  brandSlug,
  stepId,
  initialSlides,
  saveSlides,
  upload,
}: Props) {
  const router = useRouter();
  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSlides(initialSlides);
  }, [initialSlides, stepId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const persist = (next: Slide[], message: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await saveSlides(stepId, next);
        setSlides(next);
        setToast(message);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    persist(next, "Slide reordered");
  };

  const handleDelete = (index: number) => {
    if (slides.length <= 1) {
      setError(
        "Can't delete the last slide — the step needs at least one to render.",
      );
      return;
    }
    if (!confirm("Delete this slide?")) return;
    const next = slides.filter((_, i) => i !== index);
    persist(next, "Slide deleted");
  };

  const handleSaveFromDrawer = (slide: Slide, index: number | null) => {
    const next = [...slides];
    if (index === null) {
      next.push(slide);
      persist(next, "Slide added");
    } else {
      next[index] = slide;
      persist(next, "Slide updated");
    }
    setDrawer(null);
  };

  return (
    <>
      {slides.length === 0 ? (
        <div className="adm-cardlist-empty">
          <p>No slides yet. Add your first slide to get started.</p>
        </div>
      ) : (
        <ul className="adm-slidelist">
          {slides.map((slide, i) => (
            <li key={slide.id} className="adm-sliderow">
              <span className="adm-sliderow-num">{i + 1}</span>
              <div className="adm-sliderow-thumb">
                {slide.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={slide.image_url} alt={slide.alt ?? ""} />
                ) : (
                  <div className="adm-sliderow-thumb-empty">—</div>
                )}
              </div>
              <div className="adm-sliderow-meta">
                <div className="adm-sliderow-alt">
                  {slide.alt || <span className="adm-muted">No alt text</span>}
                </div>
                {slide.caption && (
                  <div className="adm-sliderow-caption">{slide.caption}</div>
                )}
              </div>
              <div className="adm-sliderow-reorder">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, -1)}
                  disabled={i === 0 || pending}
                  aria-label="Move slide up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => handleMove(i, 1)}
                  disabled={i === slides.length - 1 || pending}
                  aria-label="Move slide down"
                  title="Move down"
                >
                  ↓
                </button>
              </div>
              <div className="adm-sliderow-actions">
                <button
                  type="button"
                  className="adm-btn-ghost"
                  onClick={() => setDrawer({ mode: "edit", index: i })}
                  disabled={pending}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => handleDelete(i)}
                  disabled={pending || slides.length <= 1}
                  title={
                    slides.length <= 1
                      ? "Can't delete the last slide"
                      : "Delete slide"
                  }
                  aria-label="Delete slide"
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="adm-add-zone">
        <button
          type="button"
          className="adm-btn-primary"
          onClick={() => setDrawer({ mode: "create" })}
          disabled={pending}
        >
          + Add slide
        </button>
      </div>

      {error && <div className="adm-form-error adm-form-error-inline">{error}</div>}

      {drawer && (
        <SlideDrawer
          brandSlug={brandSlug}
          upload={upload}
          initial={
            drawer.mode === "edit" ? slides[drawer.index] : newSlide()
          }
          indexForEdit={drawer.mode === "edit" ? drawer.index : null}
          onCancel={() => setDrawer(null)}
          onSave={handleSaveFromDrawer}
          saving={pending}
        />
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </>
  );
}

// ---- drawer ----

interface DrawerProps {
  brandSlug: string;
  upload: UploadFn;
  initial: Slide;
  indexForEdit: number | null;
  onCancel: () => void;
  onSave: (slide: Slide, index: number | null) => void;
  saving: boolean;
}

function SlideDrawer({
  brandSlug,
  upload,
  initial,
  indexForEdit,
  onCancel,
  onSave,
  saving,
}: DrawerProps) {
  const [slide, setSlide] = useState<Slide>(initial);
  const isEdit = indexForEdit !== null;
  const valid = slide.image_url.trim().length > 0;

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {isEdit ? "Edit" : "Add"} slide
            </div>
            <h2 className="adm-drawer-title">
              {isEdit ? `Slide ${indexForEdit + 1}` : "New slide"}
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
          <ImageUpload
            label="Image *"
            value={slide.image_url || null}
            onChange={(url) =>
              setSlide({ ...slide, image_url: url ?? "" })
            }
            brandSlug={brandSlug}
            onUpload={upload}
          />

          <label className="adm-field">
            <span className="adm-form-label">Alt text</span>
            <input
              type="text"
              className="adm-input"
              value={slide.alt ?? ""}
              onChange={(e) =>
                setSlide({ ...slide, alt: e.target.value || null })
              }
              placeholder="Describe the slide for screen readers"
            />
          </label>

          <label className="adm-field">
            <span className="adm-form-label">Caption</span>
            <input
              type="text"
              className="adm-input"
              value={slide.caption ?? ""}
              onChange={(e) =>
                setSlide({ ...slide, caption: e.target.value || null })
              }
              placeholder="Optional caption shown below the slide"
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
            onClick={() => onSave(slide, indexForEdit)}
            disabled={!valid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
