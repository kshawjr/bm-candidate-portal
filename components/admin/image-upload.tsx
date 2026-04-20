"use client";

import { useRef, useState, useTransition } from "react";

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
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function ImageUpload({
  value,
  onChange,
  brandSlug,
  onUpload,
  label = "Image",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSelect = (file: File) => {
    setError(null);
    if (!ALLOWED.has(file.type)) {
      setError("JPG, PNG, or WebP only");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be under 5 MB");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const result = (await onUpload(brandSlug, fd)) as UploadResult;
      if (result.url) {
        onChange(result.url);
      } else {
        setError(result.error || "Upload failed");
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
  };

  return (
    <div className="adm-upload">
      <label className="adm-form-label">{label}</label>
      {value ? (
        <div className="adm-upload-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" />
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
      ) : (
        <button
          type="button"
          className="adm-upload-zone"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
        >
          {pending ? "Uploading…" : "Click to upload"}
          <span className="adm-upload-hint">JPG, PNG, or WebP · up to 5 MB</span>
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
