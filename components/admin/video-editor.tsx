"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  VideoRenderer,
  type VideoConfig,
  type VideoSource,
} from "@/components/content-types/video-renderer";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

interface Props {
  brandSlug: string;
  stepId: string;
  initialConfig: VideoConfig;
  saveConfig: (stepId: string, config: VideoConfig) => Promise<void>;
  uploadVideo: UploadFn;
}

const DEFAULT_CONFIG: VideoConfig = {
  source: "youtube",
  url: "",
  title: "",
  body: "",
  cta_label: "",
};

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MAX_VIDEO_MB = 100;

function normalize(raw: unknown): VideoConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CONFIG;
  const r = raw as Record<string, unknown>;
  const source: VideoSource =
    r.source === "vimeo" || r.source === "upload" ? r.source : "youtube";
  return {
    source,
    url: typeof r.url === "string" ? r.url : "",
    title: typeof r.title === "string" ? r.title : "",
    body: typeof r.body === "string" ? r.body : "",
    cta_label: typeof r.cta_label === "string" ? r.cta_label : "",
  };
}

export function VideoEditor({
  brandSlug,
  stepId,
  initialConfig,
  saveConfig,
  uploadVideo,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<VideoConfig>(() =>
    normalize(initialConfig),
  );
  const [pending, startTransition] = useTransition();
  const [uploading, startUploading] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  useEffect(() => {
    setConfig(normalize(initialConfig));
  }, [initialConfig, stepId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const urlValid = urlLooksValid(config);
  const dirty =
    JSON.stringify(config) !== JSON.stringify(normalize(initialConfig));

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveConfig(stepId, config);
        setToast("Video saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      setError("MP4, MOV, or WebM only");
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Video must be under ${MAX_VIDEO_MB} MB`);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setUploadFileName(file.name);
    startUploading(async () => {
      const result = await uploadVideo(brandSlug, fd);
      if ("url" in result) {
        setConfig({ ...config, source: "upload", url: result.url });
        setToast("Video uploaded");
      } else {
        setError(result.error);
        setUploadFileName(null);
      }
    });
  };

  return (
    <div className="adm-video-editor">
      <section className="adm-video-preview">
        <div className="adm-upload-purpose">Preview</div>
        {urlValid ? (
          <VideoRenderer
            config={config}
            onComplete={() => setToast("(Preview — candidates see this button)")}
          />
        ) : (
          <div className="cine-placeholder">
            <div className="cine-placeholder-icon">🎬</div>
            <h4>Enter a URL to preview</h4>
            <p>The candidate-facing player will appear here once the URL is valid.</p>
          </div>
        )}
      </section>

      <section className="adm-video-form">
        <div className="adm-field">
          <span className="adm-form-label">Source</span>
          <div className="adm-radio-row">
            {(["youtube", "vimeo", "upload"] as const).map((src) => (
              <label key={src} className="adm-radio">
                <input
                  type="radio"
                  name="video-source"
                  value={src}
                  checked={config.source === src}
                  onChange={() =>
                    setConfig({ ...config, source: src, url: "" })
                  }
                />
                <span>{sourceLabel(src)}</span>
              </label>
            ))}
          </div>
        </div>

        {config.source === "upload" ? (
          <label className="adm-field">
            <span className="adm-form-label">
              Video file{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <div className="adm-upload-reco">
              MP4, MOV, or WebM · up to {MAX_VIDEO_MB} MB. For the best
              experience, export at 1080p.
            </div>
            {config.url ? (
              <div className="adm-upload-preview">
                <div className="adm-upload-preview-body">
                  <div className="adm-upload-dims">
                    ✓ Uploaded{uploadFileName ? ` · ${uploadFileName}` : ""}
                  </div>
                  <div className="adm-upload-preview-actions">
                    <label className="adm-btn-ghost" style={{ cursor: "pointer" }}>
                      {uploading ? "Uploading…" : "Replace"}
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelect(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="adm-btn-ghost adm-btn-danger"
                      onClick={() => {
                        setConfig({ ...config, url: "" });
                        setUploadFileName(null);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label className="adm-upload-zone" style={{ cursor: "pointer" }}>
                {uploading ? "Uploading…" : "Click to upload a video"}
                <span className="adm-upload-hint">
                  MP4 / MOV / WebM · up to {MAX_VIDEO_MB} MB
                </span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </label>
        ) : (
          <label className="adm-field">
            <span className="adm-form-label">
              URL{" "}
              <span className="adm-form-required" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="url"
              className="adm-input"
              value={config.url}
              onChange={(e) => setConfig({ ...config, url: e.target.value })}
              placeholder={
                config.source === "youtube"
                  ? "https://www.youtube.com/watch?v=..."
                  : "https://vimeo.com/..."
              }
            />
            {config.url && !urlValid && (
              <span className="adm-form-error">
                This URL doesn&apos;t look like a {sourceLabel(config.source)}{" "}
                link.
              </span>
            )}
          </label>
        )}

        <label className="adm-field">
          <span className="adm-form-label">Title</span>
          <input
            type="text"
            className="adm-input"
            value={config.title ?? ""}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
            placeholder="Optional — shown above the player"
          />
        </label>

        <label className="adm-field">
          <span className="adm-form-label">Body</span>
          <textarea
            className="adm-textarea"
            rows={3}
            value={config.body ?? ""}
            onChange={(e) => setConfig({ ...config, body: e.target.value })}
            placeholder="Optional — short description shown below the video"
          />
        </label>

        <label className="adm-field">
          <span className="adm-form-label">CTA label</span>
          <input
            type="text"
            className="adm-input"
            value={config.cta_label ?? ""}
            onChange={(e) =>
              setConfig({ ...config, cta_label: e.target.value })
            }
            placeholder="Continue →"
          />
        </label>

        {error && (
          <div className="adm-form-error adm-form-error-inline">{error}</div>
        )}

        <div className="adm-video-save">
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={!urlValid || !dirty || pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}

function sourceLabel(src: VideoSource): string {
  if (src === "youtube") return "YouTube";
  if (src === "vimeo") return "Vimeo";
  return "Upload";
}

function urlLooksValid(config: VideoConfig): boolean {
  const url = config.url?.trim();
  if (!url) return false;
  if (config.source === "upload") return url.startsWith("http");
  if (config.source === "youtube") {
    return /youtube\.com|youtu\.be/.test(url);
  }
  if (config.source === "vimeo") {
    return /vimeo\.com/.test(url);
  }
  return false;
}
