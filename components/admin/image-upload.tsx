"use client";

import { useEffect, useRef, useState, useTransition } from "react";

interface UploadResult {
  url?: string;
  error?: string;
}

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  brandSlug: string;
  onUpload: (
    brandSlug: string,
    formData: FormData,
  ) => Promise<{ url: string } | { error: string }>;
  label?: string;
  /** e.g. "1600 × 900 px (16:9)" — shown as helper text above the upload zone. */
  recommendedSize?: string;
  /** e.g. "JPG or PNG" — shown alongside the size recommendation. */
  recommendedFormat?: string;
  /** Client-side soft cap, in megabytes. Defaults to 5. */
  maxSizeMB?: number;
  /** Optional context string, e.g. "Brand tour slide" — shown as eyebrow. */
  purpose?: string;
}

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageUpload({
  value,
  onChange,
  brandSlug,
  onUpload,
  label = "Image",
  recommendedSize,
  recommendedFormat,
  maxSizeMB = 5,
  purpose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [lastUploadBytes, setLastUploadBytes] = useState<number | null>(null);

  // When the URL changes (either from a fresh upload or an incoming edit),
  // reset measured dimensions so the next onLoad event repopulates them.
  useEffect(() => {
    setDimensions(null);
  }, [value]);

  const maxBytes = Math.round(maxSizeMB * 1024 * 1024);

  const handleSelect = (file: File) => {
    setError(null);
    if (!ALLOWED.has(file.type)) {
      setError("JPG, PNG, or WebP only");
      return;
    }
    if (file.size > maxBytes) {
      setError(`Image must be under ${maxSizeMB} MB`);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setLastUploadBytes(file.size);
    startTransition(async () => {
      const result = (await onUpload(brandSlug, fd)) as UploadResult;
      if (result.url) {
        onChange(result.url);
      } else {
        setError(result.error || "Upload failed");
        setLastUploadBytes(null);
      }
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSelect(file);
    e.target.value = "";
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
    setDimensions(null);
    setLastUploadBytes(null);
  };

  const helperParts = [
    recommendedSize && `Recommended: ${recommendedSize}`,
    recommendedFormat,
  ].filter(Boolean);
  const helperText = helperParts.join(", ");

  return (
    <div className="adm-upload">
      <label className="adm-form-label">{label}</label>
      {purpose && <div className="adm-upload-purpose">{purpose}</div>}
      {(helperText || maxSizeMB) && (
        <div className="adm-upload-reco">
          {helperText && <span>{helperText}</span>}
          {helperText && <span> · </span>}
          <span>Max {maxSizeMB} MB</span>
        </div>
      )}
      {value ? (
        <div className="adm-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            onLoad={(e) => {
              const img = e.currentTarget;
              if (img.naturalWidth && img.naturalHeight) {
                setDimensions({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }
            }}
          />
          <div className="adm-upload-preview-body">
            {dimensions && (
              <div className="adm-upload-dims">
                ✓ {dimensions.width} × {dimensions.height} px
                {lastUploadBytes
                  ? ` · ${formatBytes(lastUploadBytes)}`
                  : ""}
              </div>
            )}
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
                onClick={handleRemove}
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
            JPG, PNG, or WebP · up to {maxSizeMB} MB
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="adm-upload-file"
        onChange={handleChange}
      />
      {error && <div className="adm-form-error">{error}</div>}
    </div>
  );
}
