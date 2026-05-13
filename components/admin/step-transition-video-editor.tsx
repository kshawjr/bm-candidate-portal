"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StepTransitionVideoFormData } from "@/app/admin/content/step-video-actions";

export interface StepTransitionVideoInitial {
  videoUrl: string;
  posterUrl: string | null;
  hasSound: boolean | null;
  isActive: boolean;
}

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
  stepLabel: string;
  initial: StepTransitionVideoInitial | null;
  onSave: (
    stepId: string,
    data: StepTransitionVideoFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  onDelete: (stepId: string) => Promise<{ success: boolean; error?: string }>;
  uploadVideo: VideoUploadInitFn;
}

const STEP_VIDEO_MAX_MB = 100;
const STEP_VIDEO_ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/**
 * Inline editor for a step's transition VIDEO. Sits below the popup
 * editor on /admin/content — same accordion shape so the step row
 * stays compact when nothing's configured.
 *
 * Plays the first time a candidate DEPARTS this step (i.e. between
 * this step and the next one), not on arrival. If the next step also
 * has a transition popup configured, the video plays first, then the
 * popup. Matches chapter video "between transitions" semantics.
 */
export function StepTransitionVideoEditor({
  brandSlug,
  stepId,
  stepLabel,
  initial,
  onSave,
  onDelete,
  uploadVideo,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(initial !== null);
  const [form, setForm] = useState<StepTransitionVideoFormData>(() => ({
    videoUrl: initial?.videoUrl ?? "",
    posterUrl: initial?.posterUrl ?? null,
    hasSound: initial?.hasSound ?? null,
    isActive: initial?.isActive ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleVideoFile = (file: File) => {
    setError(null);
    if (!STEP_VIDEO_ALLOWED_TYPES.has(file.type)) {
      setError("MP4, MOV, or WebM only");
      return;
    }
    if (file.size > STEP_VIDEO_MAX_MB * 1024 * 1024) {
      setError(
        `Video files must be under ${STEP_VIDEO_MAX_MB}MB. Try compressing or trimming.`,
      );
      return;
    }
    setUploading(true);
    startTransition(async () => {
      try {
        const init = await uploadVideo(
          brandSlug,
          file.name,
          file.type,
          file.size,
        );
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
        setForm((f) => ({ ...f, videoUrl: init.publicUrl }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    });
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSave(stepId, form);
      if (result.success) {
        setToast("Transition video saved");
        router.refresh();
      } else {
        setError(result.error || "Save failed");
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete the transition video for "${stepLabel}"? Candidates will no longer see it.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onDelete(stepId);
      if (result.success) {
        setToast("Transition video removed");
        setForm({
          videoUrl: "",
          posterUrl: null,
          hasSound: null,
          isActive: true,
        });
        router.refresh();
      } else {
        setError(result.error || "Delete failed");
      }
    });
  };

  const valid =
    form.videoUrl.trim().length > 0 &&
    (form.hasSound === true || form.hasSound === false);

  return (
    <section className="adm-cards-section" style={{ marginTop: 16 }}>
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
          Transition video{" "}
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
          A short MP4 that plays the first time a candidate advances past this
          step. Sequences before the transition popup if both are configured.
        </p>
      )}

      {open && (
        <div className="adm-card" style={{ padding: 20, marginTop: 12 }}>
          <p
            className="adm-form-hint"
            style={{ marginTop: 0, marginBottom: 16 }}
          >
            Plays full-screen when a candidate moves past this step. A
            &ldquo;Continue&rdquo; button shows when the video ends; candidate
            clicks it to advance. Each candidate sees it at most once.
          </p>

          <div className="adm-field">
            <label className="adm-form-label">
              Video file{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </label>
            <div className="adm-upload-reco">
              <span>MP4 / MOV / WebM · Max {STEP_VIDEO_MAX_MB} MB</span>
            </div>
            {form.videoUrl ? (
              <div className="adm-upload-preview">
                <video
                  src={form.videoUrl}
                  controls
                  width={320}
                  preload="metadata"
                />
                <div className="adm-upload-preview-body">
                  <div className="adm-upload-preview-actions">
                    <button
                      type="button"
                      className="adm-btn-ghost"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || pending}
                    >
                      {uploading ? "Uploading…" : "Replace"}
                    </button>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn-danger"
                      onClick={() =>
                        setForm((f) => ({ ...f, videoUrl: "" }))
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
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || pending}
              >
                {uploading ? "Uploading…" : "Click to upload a video"}
                <span className="adm-upload-hint">
                  MP4 / MOV / WebM · up to {STEP_VIDEO_MAX_MB} MB
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="adm-upload-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <fieldset className="adm-field">
            <legend className="adm-form-label">
              Does this video have sound?{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </legend>
            <div className="adm-radio-row">
              <label className="adm-radio">
                <input
                  type="radio"
                  name={`step-video-has-sound-${stepId}`}
                  checked={form.hasSound === true}
                  onChange={() => setForm({ ...form, hasSound: true })}
                />
                <span>Yes, this video has audio</span>
              </label>
              <label className="adm-radio">
                <input
                  type="radio"
                  name={`step-video-has-sound-${stepId}`}
                  checked={form.hasSound === false}
                  onChange={() => setForm({ ...form, hasSound: false })}
                />
                <span>No, this video is silent</span>
              </label>
            </div>
            <span className="adm-form-hint">
              Videos with audio show a &ldquo;Tap for sound&rdquo; pill so
              candidates know to unmute. Silent videos play muted with no
              overlay.
            </span>
          </fieldset>

          <label className="adm-field">
            <span className="adm-form-label">Poster image URL (optional)</span>
            <input
              type="url"
              className="adm-input"
              value={form.posterUrl ?? ""}
              onChange={(e) =>
                setForm({ ...form, posterUrl: e.target.value || null })
              }
              placeholder="https://… — shown before the video plays"
            />
            <span className="adm-form-hint">
              Optional. Paste a URL to an existing JPG/PNG. Leave blank to
              show the video&apos;s default first frame.
            </span>
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
              Active — show this video to candidates
            </span>
          </label>

          {error && (
            <div className="adm-form-error adm-form-error-inline">{error}</div>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            {initial && (
              <button
                type="button"
                className="adm-btn-ghost adm-btn-danger"
                onClick={handleDelete}
                disabled={pending || uploading}
              >
                Delete
              </button>
            )}
            <button
              type="button"
              className="adm-btn-primary"
              onClick={handleSave}
              disabled={!valid || pending || uploading}
            >
              {pending
                ? "Saving…"
                : initial
                  ? "Save changes"
                  : "Create video"}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </section>
  );
}
