"use client";

import { useState, useTransition } from "react";
import type { ContentCard } from "@/components/content-cards/types";
import {
  UNLOCK_KEY_OPTIONS,
  type UnlockKey,
} from "@/lib/unlock-keys";
import { LockedTeaserCard } from "@/components/content-cards/locked-teaser-card";
import {
  AwardsForm,
  FactForm,
  JourneyAheadForm,
  PersonasForm,
  PhotoForm,
  QuoteForm,
  defaultCardFor,
  isCardValid,
} from "./card-forms";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

interface Props {
  brandSlug: string;
  // Initial card (edit mode) or just a type (create mode)
  initial: ContentCard | { type: ContentCard["type"]; create: true };
  cardIndex?: number; // undefined when creating
  onSave: (card: ContentCard, cardIndex?: number) => Promise<void>;
  onCancel: () => void;
  upload: UploadFn;
}

const TYPE_LABEL: Record<ContentCard["type"], string> = {
  fact: "Fact",
  quote: "Quote",
  awards: "Small Picture Card",
  personas: "Large Picture Card",
  photo: "Photo",
  journey_ahead: "Your Journey Ahead",
};

export function CardEditor({
  brandSlug,
  initial,
  cardIndex,
  onSave,
  onCancel,
  upload,
}: Props) {
  const isCreate = "create" in initial;
  const [card, setCard] = useState<ContentCard>(() =>
    isCreate ? defaultCardFor(initial.type) : (initial as ContentCard),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"visible" | "locked">(
    "visible",
  );

  const valid = isCardValid(card);

  // Set / clear the unlock_key. "(none)" deletes the field rather than
  // storing it as null/empty so the JSONB stays clean — callers reading
  // `card.unlock_key` get `undefined`, not an empty string.
  const setUnlockKey = (next: UnlockKey | "(none)") => {
    setCard((prev) => {
      if (next === "(none)") {
        const { unlock_key, show_locked_teaser, locked_teaser_text, ...rest } =
          prev;
        // Discard `show_locked_teaser` + `locked_teaser_text` too — they
        // only have meaning when an unlock_key is present. Keeps the
        // JSONB minimal and the editor self-consistent (you can't have
        // a teaser without something to gate on).
        void unlock_key;
        void show_locked_teaser;
        void locked_teaser_text;
        return rest as ContentCard;
      }
      return { ...prev, unlock_key: next } as ContentCard;
    });
  };

  const setShowTeaser = (next: boolean) => {
    setCard((prev) => {
      if (!next) {
        const { show_locked_teaser, locked_teaser_text, ...rest } = prev;
        void show_locked_teaser;
        void locked_teaser_text;
        return rest as ContentCard;
      }
      return { ...prev, show_locked_teaser: true } as ContentCard;
    });
  };

  const setTeaserText = (next: string) => {
    setCard((prev) => ({ ...prev, locked_teaser_text: next }) as ContentCard);
  };

  const handleSave = () => {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      try {
        await onSave(card, cardIndex);
        onCancel(); // close drawer on success
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const renderForm = () => {
    const common = { brandSlug, upload };
    switch (card.type) {
      case "fact":
        return <FactForm value={card} onChange={setCard} {...common} />;
      case "quote":
        return <QuoteForm value={card} onChange={setCard} {...common} />;
      case "awards":
        return <AwardsForm value={card} onChange={setCard} {...common} />;
      case "personas":
        return <PersonasForm value={card} onChange={setCard} {...common} />;
      case "photo":
        return <PhotoForm value={card} onChange={setCard} {...common} />;
      case "journey_ahead":
        return <JourneyAheadForm value={card} onChange={setCard} {...common} />;
    }
  };

  return (
    <div className="adm-drawer-backdrop" role="dialog" aria-modal="true">
      <div className="adm-drawer">
        <header className="adm-drawer-head">
          <div>
            <div className="adm-drawer-eyebrow">
              {isCreate ? "Add" : "Edit"} card
            </div>
            <h2 className="adm-drawer-title">{TYPE_LABEL[card.type]}</h2>
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
          {renderForm()}

          <fieldset className="adm-fieldset">
            <legend>Visibility</legend>

            <label className="adm-field">
              <span className="adm-form-label">Unlock key</span>
              <select
                className="adm-input"
                value={card.unlock_key ?? "(none)"}
                onChange={(e) =>
                  setUnlockKey(e.target.value as UnlockKey | "(none)")
                }
              >
                <option value="(none)">Always visible</option>
                {UNLOCK_KEY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="adm-form-hint">
                When set, the card only renders for candidates whose
                <code> Portal_Unlocks </code> includes this value.
              </span>
            </label>

            {card.unlock_key && (
              <>
                <label className="adm-field adm-field-row">
                  <input
                    type="checkbox"
                    checked={Boolean(card.show_locked_teaser)}
                    onChange={(e) => setShowTeaser(e.target.checked)}
                  />
                  <span>Show locked teaser instead of hiding</span>
                </label>

                {card.show_locked_teaser && (
                  <>
                    <label className="adm-field">
                      <span className="adm-form-label">Teaser text</span>
                      <input
                        className="adm-input"
                        type="text"
                        placeholder="Unlocks soon"
                        value={card.locked_teaser_text ?? ""}
                        onChange={(e) => setTeaserText(e.target.value)}
                      />
                      <span className="adm-form-hint">
                        Optional. Falls back to &ldquo;Unlocks soon&rdquo;.
                      </span>
                    </label>

                    <div className="adm-preview-toolbar">
                      <div className="adm-preview-tabs" role="tablist">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={previewMode === "visible"}
                          className={previewMode === "visible" ? "is-active" : ""}
                          onClick={() => setPreviewMode("visible")}
                        >
                          Visible
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={previewMode === "locked"}
                          className={previewMode === "locked" ? "is-active" : ""}
                          onClick={() => setPreviewMode("locked")}
                        >
                          Locked
                        </button>
                      </div>
                      <span className="adm-preview-hint">Preview state</span>
                    </div>
                    {previewMode === "locked" ? (
                      <div className="adm-preview-frame">
                        <LockedTeaserCard
                          teaserText={
                            card.locked_teaser_text?.trim() || "Unlocks soon"
                          }
                        />
                      </div>
                    ) : (
                      <div className="adm-form-hint">
                        Visible state matches the configuration above — save and
                        view in the candidate portal for the full render.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </fieldset>

          {error && <div className="adm-form-error adm-form-error-inline">{error}</div>}
        </div>

        <footer className="adm-drawer-foot">
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="adm-btn-primary"
            onClick={handleSave}
            disabled={!valid || pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
