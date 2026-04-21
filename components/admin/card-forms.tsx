"use client";

// Per-type editor forms. Each component receives the current card value
// (or null for "new"), an onChange callback, and renders only its own
// fields. The parent CardEditor handles Save/Cancel + validation gate.

import type {
  AwardsCardData,
  ContentCard,
  FactCardData,
  PersonasCardData,
  PhotoCardData,
  QuoteCardData,
} from "@/components/content-cards/types";
import { ImageUpload } from "./image-upload";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

interface CommonProps {
  brandSlug: string;
  upload: UploadFn;
}

// --- Fact ---

export function FactForm({
  value,
  onChange,
  brandSlug,
  upload,
}: { value: FactCardData; onChange: (v: FactCardData) => void } & CommonProps) {
  return (
    <>
      <Field label="Headline" required>
        <input
          type="text"
          className="adm-input"
          value={value.headline}
          onChange={(e) => onChange({ ...value, headline: e.target.value })}
          autoFocus
        />
      </Field>
      <Field label="Body" required>
        <textarea
          className="adm-textarea"
          rows={4}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </Field>
      <ImageUpload
        label="Image (optional)"
        value={value.image_url ?? null}
        onChange={(url) =>
          onChange({ ...value, image_url: url ?? undefined })
        }
        brandSlug={brandSlug}
        onUpload={upload}
        recommendedSize="800 × 600 px (4:3)"
        recommendedFormat="JPG or PNG"
        maxSizeMB={2}
      />
      <Field label="Source (optional)">
        <input
          type="text"
          className="adm-input"
          value={value.source ?? ""}
          onChange={(e) =>
            onChange({ ...value, source: e.target.value || undefined })
          }
          placeholder="e.g. American Pet Products Association, 2025"
        />
      </Field>
    </>
  );
}

export function isFactValid(v: FactCardData): boolean {
  return v.headline.trim().length > 0 && v.body.trim().length > 0;
}

// --- Quote ---

export function QuoteForm({
  value,
  onChange,
  brandSlug,
  upload,
}: { value: QuoteCardData; onChange: (v: QuoteCardData) => void } & CommonProps) {
  return (
    <>
      <Field label="Author" required>
        <input
          type="text"
          className="adm-input"
          value={value.author}
          onChange={(e) => onChange({ ...value, author: e.target.value })}
          autoFocus
        />
      </Field>
      <Field label="Role / title" required>
        <input
          type="text"
          className="adm-input"
          value={value.role}
          onChange={(e) => onChange({ ...value, role: e.target.value })}
          placeholder="e.g. CEO, Hounds Town USA"
        />
      </Field>
      <Field label="Quote" required>
        <textarea
          className="adm-textarea"
          rows={5}
          value={value.body}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
        />
      </Field>
      <ImageUpload
        label="Photo (optional)"
        value={value.photo_url ?? null}
        onChange={(url) =>
          onChange({ ...value, photo_url: url ?? undefined })
        }
        brandSlug={brandSlug}
        onUpload={upload}
        recommendedSize="600 × 800 px (3:4 portrait)"
        recommendedFormat="JPG"
        maxSizeMB={2}
      />
    </>
  );
}

export function isQuoteValid(v: QuoteCardData): boolean {
  return (
    v.author.trim().length > 0 &&
    v.role.trim().length > 0 &&
    v.body.trim().length > 0
  );
}

// --- Awards ---

export function AwardsForm({
  value,
  onChange,
  brandSlug,
  upload,
}: { value: AwardsCardData; onChange: (v: AwardsCardData) => void } & CommonProps) {
  const items = value.items;
  const updateItem = (idx: number, patch: Partial<(typeof items)[number]>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...value, items: next });
  };
  const removeItem = (idx: number) => {
    onChange({ ...value, items: items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    onChange({ ...value, items: [...items, { name: "" }] });
  };

  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="adm-repeatable-row">
          <div className="adm-repeatable-head">
            <span className="adm-repeatable-label">Award {i + 1}</span>
            {items.length > 1 && (
              <button
                type="button"
                className="adm-btn-ghost adm-btn-danger"
                onClick={() => removeItem(i)}
              >
                Remove
              </button>
            )}
          </div>
          <Field label="Name" required>
            <input
              type="text"
              className="adm-input"
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
            />
          </Field>
          <Field label="Year (optional)">
            <input
              type="text"
              className="adm-input"
              value={item.year ?? ""}
              onChange={(e) =>
                updateItem(i, { year: e.target.value || undefined })
              }
              placeholder="e.g. 2025"
            />
          </Field>
          <ImageUpload
            label="Logo (optional)"
            value={item.logo_url ?? null}
            onChange={(url) => updateItem(i, { logo_url: url ?? undefined })}
            brandSlug={brandSlug}
            onUpload={upload}
            recommendedSize="Source PNG"
            recommendedFormat="PNG with transparency preferred"
            maxSizeMB={0.5}
          />
        </div>
      ))}
      <button type="button" className="adm-btn-ghost" onClick={addItem}>
        + Add award
      </button>
    </>
  );
}

export function isAwardsValid(v: AwardsCardData): boolean {
  return v.items.length > 0 && v.items.every((it) => it.name.trim().length > 0);
}

// --- Personas ---

export function PersonasForm({
  value,
  onChange,
  brandSlug,
  upload,
}: { value: PersonasCardData; onChange: (v: PersonasCardData) => void } & CommonProps) {
  const items = value.items;
  const updateItem = (idx: number, patch: Partial<(typeof items)[number]>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange({ ...value, items: next });
  };
  const removeItem = (idx: number) => {
    if (items.length <= 2) return;
    onChange({ ...value, items: items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    if (items.length >= 6) return;
    onChange({ ...value, items: [...items, { name: "" }] });
  };

  return (
    <>
      <p className="adm-form-hint">2 to 6 personas.</p>
      {items.map((item, i) => (
        <div key={i} className="adm-repeatable-row">
          <div className="adm-repeatable-head">
            <span className="adm-repeatable-label">Persona {i + 1}</span>
            {items.length > 2 && (
              <button
                type="button"
                className="adm-btn-ghost adm-btn-danger"
                onClick={() => removeItem(i)}
              >
                Remove
              </button>
            )}
          </div>
          <Field label="Name" required>
            <input
              type="text"
              className="adm-input"
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
            />
          </Field>
          <Field label="Caption (optional)">
            <input
              type="text"
              className="adm-input"
              value={item.caption ?? ""}
              onChange={(e) =>
                updateItem(i, { caption: e.target.value || undefined })
              }
            />
          </Field>
          <ImageUpload
            label="Photo (optional)"
            value={item.photo_url ?? null}
            onChange={(url) => updateItem(i, { photo_url: url ?? undefined })}
            brandSlug={brandSlug}
            onUpload={upload}
            recommendedSize="400 × 400 px (square)"
            recommendedFormat="JPG"
            maxSizeMB={1}
          />
        </div>
      ))}
      {items.length < 6 && (
        <button type="button" className="adm-btn-ghost" onClick={addItem}>
          + Add persona
        </button>
      )}
    </>
  );
}

export function isPersonasValid(v: PersonasCardData): boolean {
  return (
    v.items.length >= 2 &&
    v.items.length <= 6 &&
    v.items.every((it) => it.name.trim().length > 0)
  );
}

// --- Photo ---

export function PhotoForm({
  value,
  onChange,
  brandSlug,
  upload,
}: { value: PhotoCardData; onChange: (v: PhotoCardData) => void } & CommonProps) {
  return (
    <>
      <ImageUpload
        label="Image (required)"
        value={value.image_url || null}
        onChange={(url) => onChange({ ...value, image_url: url ?? "" })}
        brandSlug={brandSlug}
        onUpload={upload}
        recommendedSize="1600 × 900 px (16:9)"
        recommendedFormat="JPG"
        maxSizeMB={2}
      />
      <Field label="Caption (optional)">
        <input
          type="text"
          className="adm-input"
          value={value.caption ?? ""}
          onChange={(e) =>
            onChange({ ...value, caption: e.target.value || undefined })
          }
          placeholder="e.g. The fleet in action · Tampa Bay"
        />
      </Field>
    </>
  );
}

export function isPhotoValid(v: PhotoCardData): boolean {
  return v.image_url.length > 0;
}

// --- Validation dispatcher ---

export function isCardValid(card: ContentCard): boolean {
  switch (card.type) {
    case "fact":
      return isFactValid(card);
    case "quote":
      return isQuoteValid(card);
    case "awards":
      return isAwardsValid(card);
    case "personas":
      return isPersonasValid(card);
    case "photo":
      return isPhotoValid(card);
  }
}

// --- Defaults for "new card" ---

export function defaultCardFor(type: ContentCard["type"]): ContentCard {
  switch (type) {
    case "fact":
      return { type: "fact", headline: "", body: "" };
    case "quote":
      return { type: "quote", author: "", role: "", body: "" };
    case "awards":
      return { type: "awards", items: [{ name: "" }] };
    case "personas":
      return {
        type: "personas",
        items: [{ name: "" }, { name: "" }],
      };
    case "photo":
      return { type: "photo", image_url: "" };
  }
}

// --- Local Field helper ---

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="adm-field">
      <span className="adm-form-label">
        {label}
        {required && <span className="adm-form-required"> *</span>}
      </span>
      {children}
    </label>
  );
}
