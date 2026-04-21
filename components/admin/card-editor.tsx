"use client";

import { useState, useTransition } from "react";
import type { ContentCard } from "@/components/content-cards/types";
import {
  AwardsForm,
  FactForm,
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
  awards: "Awards",
  personas: "Personas",
  photo: "Photo",
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

  const valid = isCardValid(card);

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
