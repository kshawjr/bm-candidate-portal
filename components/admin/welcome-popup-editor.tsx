"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  detectVideoProvider,
  parseVideoSource,
  type VideoProvider,
} from "@/lib/video-source";
import {
  WelcomePopup,
  type WelcomePopupConfig,
} from "@/components/portal/welcome-popup";
import type { WelcomePopupFormData } from "@/app/admin/welcome-popup/actions";

interface InitialPopup {
  title: string | null;
  videoUrl: string;
  videoProvider: VideoProvider;
  description: string | null;
  ctaDismissLabel: string;
  isActive: boolean;
  updatedAt: string | null;
}

interface Props {
  brandId: string;
  brandSlug: string;
  brandName: string;
  initial: InitialPopup | null;
  onSave: (
    brandId: string,
    data: WelcomePopupFormData,
  ) => Promise<{ success: boolean; error?: string }>;
  onDelete: (
    brandId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onUploadVideo: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
}

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

export function WelcomePopupEditor({
  brandId,
  brandSlug,
  brandName,
  initial,
  onSave,
  onDelete,
  onUploadVideo,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<WelcomePopupFormData>(() => ({
    title: initial?.title ?? "",
    videoUrl: initial?.videoUrl ?? "",
    videoProvider: initial?.videoProvider ?? "youtube",
    description: initial?.description ?? "",
    ctaDismissLabel: initial?.ctaDismissLabel ?? "Got it",
    isActive: initial?.isActive ?? true,
  }));
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Whenever the URL changes, try to auto-detect the provider so the admin
  // doesn't have to think about it. Manual override still works — set the
  // dropdown after pasting if the auto-detect picks the wrong one.
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
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = await onUploadVideo(brandSlug, fd);
      setUploading(false);
      if ("url" in result) {
        setForm((f) => ({
          ...f,
          videoUrl: result.url,
          videoProvider: "mp4",
        }));
        setToast("Video uploaded");
      } else {
        setError(result.error || "Upload failed");
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleVideoFile(file);
    e.target.value = "";
  };

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSave(brandId, form);
      if (result.success) {
        setToast("Welcome popup saved");
        router.refresh();
      } else {
        setError(result.error || "Save failed");
      }
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        "Delete the welcome popup for this brand? Candidates will no longer see it.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await onDelete(brandId);
      if (result.success) {
        setToast("Welcome popup deleted");
        router.refresh();
      } else {
        setError(result.error || "Delete failed");
      }
    });
  };

  const parsed = parseVideoSource(form.videoUrl);
  const urlValid = parsed !== null;

  // Build the preview config from current form state — same shape the portal
  // page passes to WelcomePopup at runtime, so the preview is a true 1:1.
  const previewConfig: WelcomePopupConfig = {
    title: form.title?.trim() || null,
    videoUrl: form.videoUrl,
    videoProvider: parsed?.provider ?? form.videoProvider,
    description: form.description?.trim() || null,
    ctaDismissLabel: form.ctaDismissLabel.trim() || "Got it",
  };

  return (
    <div className="admin-page">
      <header className="structure-head">
        <div>
          <h1 className="admin-h1">Welcome popup</h1>
          <p className="admin-muted">
            One-time onboarding video shown to new candidates of{" "}
            <strong>{brandName}</strong> on their first portal visit.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={() => setPreviewOpen(true)}
            disabled={pending || !urlValid}
            title={
              urlValid
                ? "Preview the popup as a candidate would see it"
                : "Add a valid video URL first"
            }
          >
            Preview
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={pending || !urlValid}
          >
            {pending ? "Saving…" : initial ? "Save changes" : "Create popup"}
          </button>
        </div>
      </header>

      <div className="adm-card" style={{ marginTop: 16, padding: 24 }}>
        <label className="adm-field">
          <span className="adm-form-label">Title</span>
          <input
            type="text"
            className="adm-input"
            value={form.title ?? ""}
            onChange={(e) =>
              setForm({ ...form, title: e.target.value })
            }
            placeholder="Welcome to Hounds Town"
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
              Couldn&apos;t parse this URL. Use a YouTube link, Vimeo link, or
              direct .mp4 file.
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
              MP4 / MOV / WebM, up to 100 MB. Replaces the URL above.
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={VIDEO_ACCEPT}
            style={{ display: "none" }}
            onChange={handleFileChange}
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
            Auto-detected from the URL above. Only override if you&apos;re sure.
          </span>
        </label>

        <label className="adm-field">
          <span className="adm-form-label">Description</span>
          <textarea
            className="adm-textarea"
            rows={4}
            value={form.description ?? ""}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            placeholder="A short note shown below the video. Optional."
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
            Active — show this popup to new candidates
          </span>
        </label>

        {error && <div className="adm-form-error">{error}</div>}

        {initial && (
          <div
            style={{
              marginTop: 24,
              borderTop: "1px solid #e5e7eb",
              paddingTop: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="adm-muted" style={{ fontSize: 12 }}>
              Last updated:{" "}
              {initial.updatedAt
                ? new Date(initial.updatedAt).toLocaleString()
                : "—"}
            </span>
            <button
              type="button"
              className="adm-btn-ghost adm-btn-danger"
              onClick={handleDelete}
              disabled={pending}
            >
              Delete popup
            </button>
          </div>
        )}
      </div>

      {toast && <div className="adm-toast">{toast}</div>}

      {previewOpen && urlValid && (
        <WelcomePopup
          config={previewConfig}
          onDismiss={async () => ({ success: true })}
          onDismissed={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
