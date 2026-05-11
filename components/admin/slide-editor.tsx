"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Slide } from "@/components/content-types/slides-renderer";
import { CaptionEditor } from "./caption-editor";
import { ImageUpload } from "./image-upload";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

type VideoUploadInitFn = (
  brandSlug: string,
  filename: string,
  contentType: string,
  fileSize: number,
) => Promise<
  | { signedUrl: string; publicUrl: string; contentType: string }
  | { error: string }
>;

interface Props {
  brandSlug: string;
  stepId: string;
  initialSlides: Slide[];
  saveSlides: (stepId: string, slides: Slide[]) => Promise<void>;
  upload: UploadFn;
  uploadVideo: VideoUploadInitFn;
}

type DrawerState =
  | null
  | { mode: "create" }
  | { mode: "edit"; index: number };

const SLIDE_VIDEO_MAX_MB = 100;

function newSlide(): Slide {
  return {
    id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    media_type: "image",
    image_url: "",
    video_url: null,
    poster_url: null,
    has_sound: null,
    alt: null,
    caption: null,
    caption_size: null,
  };
}

/**
 * Caption preview shown in the admin slide-row list. The stored caption
 * is HTML now — strip tags so the preview reads as plain text and we
 * don't dump literal "<strong>..." into the row.
 */
function captionPreview(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, "").trim();
  return text || null;
}

export function SlideEditor({
  brandSlug,
  stepId,
  initialSlides,
  saveSlides,
  upload,
  uploadVideo,
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
          {slides.map((slide, i) => {
            const isVideo = slide.media_type === "video";
            const thumbSrc = isVideo ? slide.poster_url : slide.image_url;
            return (
              <li key={slide.id} className="adm-sliderow">
                <span className="adm-sliderow-num">{i + 1}</span>
                <div className="adm-sliderow-thumb">
                  {thumbSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={thumbSrc} alt={slide.alt ?? ""} />
                  ) : (
                    <div className="adm-sliderow-thumb-empty">
                      {isVideo ? "▶" : "—"}
                    </div>
                  )}
                </div>
                <div className="adm-sliderow-meta">
                  <div className="adm-sliderow-alt">
                    {isVideo ? (
                      <span>Video · MP4</span>
                    ) : slide.alt ? (
                      slide.alt
                    ) : (
                      <span className="adm-muted">No alt text</span>
                    )}
                  </div>
                  {captionPreview(slide.caption) && (
                    <div className="adm-sliderow-caption">
                      {captionPreview(slide.caption)}
                    </div>
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
            );
          })}
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
          uploadVideo={uploadVideo}
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
  uploadVideo: VideoUploadInitFn;
  initial: Slide;
  indexForEdit: number | null;
  onCancel: () => void;
  onSave: (slide: Slide, index: number | null) => void;
  saving: boolean;
}

function SlideDrawer({
  brandSlug,
  upload,
  uploadVideo,
  initial,
  indexForEdit,
  onCancel,
  onSave,
  saving,
}: DrawerProps) {
  const [slide, setSlide] = useState<Slide>({
    ...initial,
    media_type: initial.media_type ?? "image",
  });
  const isEdit = indexForEdit !== null;
  const isVideo = slide.media_type === "video";
  const hasSoundPicked =
    slide.has_sound === true || slide.has_sound === false;
  const valid = isVideo
    ? !!(slide.video_url && slide.video_url.trim().length > 0) &&
      hasSoundPicked
    : slide.image_url.trim().length > 0;

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
          <fieldset className="adm-field">
            <legend className="adm-form-label">Media type</legend>
            <div className="adm-radio-row">
              <label className="adm-radio">
                <input
                  type="radio"
                  name="media_type"
                  checked={!isVideo}
                  onChange={() =>
                    setSlide({ ...slide, media_type: "image" })
                  }
                />
                <span>Image</span>
              </label>
              <label className="adm-radio">
                <input
                  type="radio"
                  name="media_type"
                  checked={isVideo}
                  onChange={() =>
                    setSlide({ ...slide, media_type: "video" })
                  }
                />
                <span>Video</span>
              </label>
            </div>
          </fieldset>

          {isVideo ? (
            <>
              <VideoUpload
                label="Video (MP4) *"
                value={slide.video_url ?? null}
                onChange={(url) =>
                  setSlide({ ...slide, video_url: url ?? null })
                }
                brandSlug={brandSlug}
                onUpload={uploadVideo}
                maxSizeMB={SLIDE_VIDEO_MAX_MB}
              />
              <fieldset className="adm-field">
                <legend className="adm-form-label">
                  Does this video have sound? *
                </legend>
                <div className="adm-radio-row">
                  <label className="adm-radio">
                    <input
                      type="radio"
                      name="has_sound"
                      checked={slide.has_sound === true}
                      onChange={() =>
                        setSlide({ ...slide, has_sound: true })
                      }
                    />
                    <span>Yes, this video has audio</span>
                  </label>
                  <label className="adm-radio">
                    <input
                      type="radio"
                      name="has_sound"
                      checked={slide.has_sound === false}
                      onChange={() =>
                        setSlide({ ...slide, has_sound: false })
                      }
                    />
                    <span>No, this video is silent</span>
                  </label>
                </div>
                <span className="adm-form-hint">
                  Videos with audio show a &ldquo;Tap for sound&rdquo;
                  pill so candidates know to unmute. Silent videos play
                  muted with no overlay.
                </span>
              </fieldset>
              <ImageUpload
                label="Poster image (optional)"
                value={slide.poster_url ?? null}
                onChange={(url) =>
                  setSlide({ ...slide, poster_url: url ?? null })
                }
                brandSlug={brandSlug}
                onUpload={upload}
                purpose="Shown as a still frame before the video plays"
                recommendedSize="1600 × 900 px (16:9)"
                recommendedFormat="JPG or PNG"
                maxSizeMB={2}
              />
            </>
          ) : (
            <ImageUpload
              label="Image *"
              value={slide.image_url || null}
              onChange={(url) =>
                setSlide({ ...slide, image_url: url ?? "" })
              }
              brandSlug={brandSlug}
              onUpload={upload}
              purpose="Brand tour slide"
              recommendedSize="1600 × 900 px (16:9)"
              recommendedFormat="JPG or PNG"
              maxSizeMB={5}
            />
          )}

          {!isVideo && (
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
          )}

          <div className="adm-field">
            <span className="adm-form-label">Caption</span>
            <CaptionEditor
              value={slide.caption ?? null}
              size={slide.caption_size ?? null}
              onChange={(html, size) =>
                setSlide({
                  ...slide,
                  caption: html,
                  caption_size: size,
                })
              }
            />
            <span className="adm-form-hint">
              Bold, italic, and links are supported. Pick a size; font is
              locked to the brand&apos;s typography.
            </span>
          </div>
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

// ---- video upload (MP4-only, signed-URL direct-to-storage) ----
//
// The MP4 binary cannot flow through a Next.js server action — Vercel
// caps function request bodies at ~4.5 MB. Instead, the server mints a
// signed upload URL via Supabase Storage, then the browser PUTs the
// file straight to the storage host. Bypasses the function entirely.

interface VideoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  brandSlug: string;
  onUpload: VideoUploadInitFn;
  label: string;
  maxSizeMB: number;
}

function VideoUpload({
  value,
  onChange,
  brandSlug,
  onUpload,
  label,
  maxSizeMB,
}: VideoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const maxBytes = Math.round(maxSizeMB * 1024 * 1024);

  const handleSelect = (file: File) => {
    setError(null);
    if (file.type !== "video/mp4") {
      setError("MP4 only");
      return;
    }
    if (file.size > maxBytes) {
      setError(
        `Video files must be under ${maxSizeMB}MB. Try compressing or trimming.`,
      );
      return;
    }
    startTransition(async () => {
      try {
        const init = await onUpload(brandSlug, file.name, file.type, file.size);
        if (!init || "error" in init) {
          setError((init && "error" in init && init.error) || "Upload failed");
          return;
        }
        const res = await fetch(init.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": init.contentType,
            "x-upsert": "false",
          },
          body: file,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setError(text || `Upload failed (${res.status})`);
          return;
        }
        onChange(init.publicUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  };

  return (
    <div className="adm-upload">
      <label className="adm-form-label">{label}</label>
      <div className="adm-upload-reco">
        <span>Format: MP4 · Max {maxSizeMB} MB</span>
      </div>
      {value ? (
        <div className="adm-upload-preview">
          <video src={value} controls width={320} preload="metadata" />
          <div className="adm-upload-preview-body">
            <div className="adm-upload-preview-actions">
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
              >
                {pending ? "Uploading…" : "Replace"}
              </button>
              <button
                type="button"
                className="adm-btn-ghost adm-btn-danger"
                onClick={() => {
                  onChange(null);
                  setError(null);
                }}
                disabled={pending}
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
          onClick={() => inputRef.current?.click()}
          disabled={pending}
        >
          {pending ? "Uploading…" : "Click to upload"}
          <span className="adm-upload-hint">
            MP4 · up to {maxSizeMB} MB
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4"
        className="adm-upload-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleSelect(file);
          e.target.value = "";
        }}
      />
      {error && <div className="adm-form-error">{error}</div>}
    </div>
  );
}
