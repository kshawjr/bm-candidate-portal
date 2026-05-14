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
  type JourneyStop,
  type PersonasCardData,
  type PhotoCardData,
  type QuoteCardData,
} from "@/components/content-cards/types";
import { DEFAULT_JOURNEY_STOPS } from "@/components/content-cards/journey-defaults";
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
      {/* PR 126: optional masked hyperlink. Both fields must be set
          for the link to render in the candidate portal — one without
          the other is treated as no link rather than a half-broken
          state. Empty input stores undefined so the JSONB stays
          minimal. */}
      <Field label="Link label (optional)">
        <input
          type="text"
          className="adm-input"
          value={value.link_label ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              link_label: e.target.value || undefined,
            })
          }
          placeholder="Connect on LinkedIn →"
        />
        <span className="adm-form-hint">
          The friendly text candidates see. Leave blank if no link.
        </span>
      </Field>
      <Field label="Link URL (optional)">
        <input
          type="text"
          className="adm-input"
          value={value.link_url ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              link_url: e.target.value || undefined,
            })
          }
          placeholder="https://linkedin.com/in/sierra-johnson"
        />
        <span className="adm-form-hint">
          Include the protocol: <code>https://</code>, <code>mailto:</code>,
          or <code>tel:</code>. External URLs open in a new tab; mailto /
          tel hand off to the device's native app.
        </span>
      </Field>
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
  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange({ ...value, items: next });
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
              <div className="adm-repeatable-actions">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => moveItem(i, i - 1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => moveItem(i, i + 1)}
                  disabled={i === items.length - 1}
                  aria-label="Move down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => removeItem(i)}
                >
                  Remove
                </button>
              </div>
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
  const moveItem = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange({ ...value, items: next });
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
              <div className="adm-repeatable-actions">
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => moveItem(i, i - 1)}
                  disabled={i === 0}
                  aria-label="Move up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-icon-btn"
                  onClick={() => moveItem(i, i + 1)}
                  disabled={i === items.length - 1}
                  aria-label="Move down"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="adm-btn-ghost adm-btn-danger"
                  onClick={() => removeItem(i)}
                >
                  Remove
                </button>
              </div>
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
// The 8-stage roadmap + brand scenery render automatically from
// candidate state + brand slug. Per-card editable surface is the
// optional title and an optional background image (rendered at 30%
// opacity behind the road + markers).

export function JourneyAheadForm({
  value,
  onChange,
  brandSlug,
  upload,
}: {
  value: JourneyAheadCardData;
  onChange: (v: JourneyAheadCardData) => void;
} & CommonProps) {
  // Legacy cards (pre-PR-stops) don't have a `stops` array; surface the
  // hardcoded defaults so the admin sees the existing copy and edits
  // from there. As soon as the admin touches any stop field, the full
  // 8-tuple gets persisted on the card.
  const stops = (value.stops ?? DEFAULT_JOURNEY_STOPS) as readonly JourneyStop[];
  const updateStop = (idx: number, patch: Partial<JourneyStop>) => {
    const next = stops.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({
      ...value,
      stops: next as JourneyAheadCardData["stops"],
    });
  };
  return (
    <>
      <CardTitleField
        cardType="journey_ahead"
        value={value.title}
        onChange={(title) => onChange({ ...value, title })}
      />
      <Field label="Caption (optional)">
        <textarea
          className="adm-textarea"
          rows={2}
          value={value.caption ?? ""}
          onChange={(e) =>
            onChange({ ...value, caption: e.target.value || null })
          }
          placeholder="Here's how the next 6–8 weeks look."
        />
        <span className="adm-form-hint">
          Shown under the card title. Leave blank to use the default.
        </span>
      </Field>
      <ImageUpload
        label="Background image (optional)"
        value={value.background_image_url ?? null}
        onChange={(url) =>
          onChange({ ...value, background_image_url: url ?? null })
        }
        brandSlug={brandSlug}
        onUpload={upload}
        purpose="Renders behind the road + stop markers; opacity below"
        recommendedSize="1600 × 900 px (16:9)"
        recommendedFormat="JPG or PNG"
        maxSizeMB={5}
      />
      {value.background_image_url && (
        <Field label="Background image opacity">
          <div className="adm-range-row">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={value.background_image_opacity ?? 30}
              onChange={(e) =>
                onChange({
                  ...value,
                  background_image_opacity: parseInt(e.target.value, 10),
                })
              }
              className="adm-range"
              aria-label="Background image opacity"
            />
            <span className="adm-range-value">
              {value.background_image_opacity ?? 30}%
            </span>
          </div>
          <span className="adm-form-hint">
            30% is the default — lower values make the photo more subtle,
            higher values make it more prominent.
          </span>
        </Field>
      )}
      <p className="adm-form-hint">
        Per-stop copy below. The roadmap scenery (paws, waves, etc.) and
        the &ldquo;You are here&rdquo; pin still render automatically
        from the candidate&apos;s progress.
      </p>
      {stops.map((stop, i) => (
        <div key={i} className="adm-repeatable-row">
          <div className="adm-repeatable-head">
            <span className="adm-repeatable-label">Stop {i + 1}</span>
          </div>
          <Field label="Title" required>
            <input
              type="text"
              className="adm-input"
              value={stop.title}
              onChange={(e) => updateStop(i, { title: e.target.value })}
            />
          </Field>
          <Field label="Caption" required>
            <textarea
              className="adm-textarea"
              rows={2}
              value={stop.caption}
              onChange={(e) => updateStop(i, { caption: e.target.value })}
            />
          </Field>
        </div>
      ))}
    </>
  );
}

export function isJourneyAheadValid(v: JourneyAheadCardData): boolean {
  const stops = v.stops ?? DEFAULT_JOURNEY_STOPS;
  return stops.every(
    (s) => s.title.trim().length > 0 && s.caption.trim().length > 0,
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
      return isJourneyAheadValid(card);
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
      return {
        type: "journey_ahead",
        stops: DEFAULT_JOURNEY_STOPS.map((s) => ({ ...s })) as JourneyAheadCardData["stops"],
      };
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
