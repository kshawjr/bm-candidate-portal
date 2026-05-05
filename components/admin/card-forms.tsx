"use client";

// Per-type editor forms. Each component receives the current card value
// (or null for "new"), an onChange callback, and renders only its own
// fields. The parent CardEditor handles Save/Cancel + validation gate.

import {
  DEFAULT_CARD_TITLES,
  type AwardsCardData,
  type ContentCard,
  type FactCardData,
  type JourneyAheadCardData,
  type PersonasCardData,
  type PhotoCardData,
  type QuoteCardData,
} from "@/components/content-cards/types";
import { ImageUpload } from "./image-upload";

const PERSONAS_MAX = 12;

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

interface CommonProps {
  brandSlug: string;
  upload: UploadFn;
}

/**
 * Shared "Card title" input rendered at the top of every per-type form.
 * Empty value persists as `undefined` so resolveCardTitle() falls back to
 * the per-type default at render time.
 */
function CardTitleField({
  cardType,
  value,
  onChange,
}: {
  cardType: ContentCard["type"];
  value: string | undefined;
  onChange: (next: string | undefined) => void;
}) {
  const fallback = DEFAULT_CARD_TITLES[cardType];
  const placeholder = fallback ?? "e.g. Why this matters";
  return (
    <Field label="Card title (optional)">
      <input
        type="text"
        className="adm-input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder}
      />
      <span className="adm-form-hint">
        {fallback
          ? `Leave blank to use the default — "${fallback}".`
          : "Leave blank to render no title above the card."}
      </span>
    </Field>
  );
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
      <CardTitleField
        cardType="fact"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
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
      <CardTitleField
        cardType="quote"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
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
      <CardTitleField
        cardType="awards"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
      {items.map((item, i) => (
        <div key={i} className="adm-repeatable-row">
          <div className="adm-repeatable-head">
            <span className="adm-repeatable-label">Small picture {i + 1}</span>
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
        + Add small picture
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
    if (items.length <= 1) return;
    onChange({ ...value, items: items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    if (items.length >= PERSONAS_MAX) return;
    onChange({ ...value, items: [...items, {}] });
  };

  return (
    <>
      <CardTitleField
        cardType="personas"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
      <p className="adm-form-hint">1 to {PERSONAS_MAX} large pictures.</p>
      {items.map((item, i) => (
        <div key={i} className="adm-repeatable-row">
          <div className="adm-repeatable-head">
            <span className="adm-repeatable-label">Large picture {i + 1}</span>
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
          <Field label="Name (optional)">
            <input
              type="text"
              className="adm-input"
              value={item.name ?? ""}
              onChange={(e) =>
                updateItem(i, { name: e.target.value || undefined })
              }
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
      {items.length < PERSONAS_MAX && (
        <button type="button" className="adm-btn-ghost" onClick={addItem}>
          + Add large picture
        </button>
      )}
    </>
  );
}

export function isPersonasValid(v: PersonasCardData): boolean {
  return v.items.length >= 1 && v.items.length <= PERSONAS_MAX;
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
      <CardTitleField
        cardType="photo"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
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

// --- Journey ahead ---
// Marker card — the roadmap stages and brand scenery are not per-instance
// configurable (they come from candidate state + brand slug). The only
// admin-editable surface is the section title, defaulting to "Your
// journey ahead". Reorder controls in the card list let admins move it
// up or down within the step's content cards.

export function JourneyAheadForm({
  value,
  onChange,
}: {
  value: JourneyAheadCardData;
  onChange: (v: JourneyAheadCardData) => void;
}) {
  return (
    <>
      <CardTitleField
        cardType="journey_ahead"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
      <p className="adm-form-hint">
        The roadmap stages and brand scenery (paws, waves, etc.) render
        automatically from the candidate&apos;s progress — only the title
        above is editable here. Drag the card up or down in the cards
        list to change where it sits within the step.
      </p>
    </>
  );
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
    case "journey_ahead":
      return true;
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
        items: [{}],
      };
    case "photo":
      return { type: "photo", image_url: "" };
    case "journey_ahead":
      return { type: "journey_ahead" };
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
