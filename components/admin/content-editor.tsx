"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ContentCard } from "@/components/content-cards/types";
import type { Slide } from "@/components/content-types/slides-renderer";
import { CardEditor } from "./card-editor";
import { SlideEditor } from "./slide-editor";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

export interface AdminStop {
  stop_key: string;
  position: number;
  label: string;
  name: string;
}

export interface AdminStep {
  id: string;
  stop_key: string;
  step_key: string;
  position: number;
  label: string;
  description: string;
  content_type: string;
  content_cards: ContentCard[];
  slides: Slide[];
}

interface Props {
  brandSlug: string;
  brandName: string;
  stops: AdminStop[];
  stepsByStop: Record<string, AdminStep[]>;
  initialStepId: string | null;
  saveCard: (
    stepId: string,
    card: ContentCard,
    cardIndex?: number,
  ) => Promise<void>;
  deleteCard: (stepId: string, cardIndex: number) => Promise<void>;
  saveSlides: (stepId: string, slides: Slide[]) => Promise<void>;
  upload: UploadFn;
  uploadSlide: UploadFn;
  candidateTokenForPreview: string | null;
}

const CARD_TYPES: Array<{ type: ContentCard["type"]; label: string }> = [
  { type: "fact", label: "Fact" },
  { type: "quote", label: "Quote" },
  { type: "awards", label: "Awards" },
  { type: "personas", label: "Personas" },
  { type: "photo", label: "Photo" },
];

function flattenSteps(
  stops: AdminStop[],
  stepsByStop: Record<string, AdminStep[]>,
): AdminStep[] {
  return stops.flatMap((s) => stepsByStop[s.stop_key] ?? []);
}

export function ContentEditor({
  brandSlug,
  brandName,
  stops,
  stepsByStop,
  initialStepId,
  saveCard,
  deleteCard,
  saveSlides,
  upload,
  uploadSlide,
  candidateTokenForPreview,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const allSteps = flattenSteps(stops, stepsByStop);
  const fallbackStepId = allSteps[0]?.id ?? null;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    initialStepId ?? fallbackStepId,
  );
  const [expandedStops, setExpandedStops] = useState<Set<string>>(() => {
    // Auto-expand the stop containing the selected step.
    const stepId = initialStepId ?? fallbackStepId;
    const initial = new Set<string>();
    if (stepId) {
      const step = allSteps.find((s) => s.id === stepId);
      if (step) initial.add(step.stop_key);
    } else if (stops[0]) {
      initial.add(stops[0].stop_key);
    }
    return initial;
  });

  const [editorState, setEditorState] = useState<
    | null
    | {
        mode: "create";
        type: ContentCard["type"];
      }
    | {
        mode: "edit";
        card: ContentCard;
        cardIndex: number;
      }
  >(null);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  // Show + auto-clear toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const selectedStep =
    selectedStepId != null
      ? allSteps.find((s) => s.id === selectedStepId) ?? null
      : null;
  const selectedStop = selectedStep
    ? stops.find((s) => s.stop_key === selectedStep.stop_key) ?? null
    : null;
  const stopNumber = selectedStop ? selectedStop.position + 1 : null;
  const stepNumber = selectedStep ? selectedStep.position + 1 : null;

  const toggleStop = (stopKey: string) => {
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stopKey)) next.delete(stopKey);
      else next.add(stopKey);
      return next;
    });
  };

  const selectStep = (stepId: string, stopKey: string) => {
    setSelectedStepId(stepId);
    setEditorState(null);
    setAddMenuOpen(false);
    setExpandedStops((prev) => {
      const next = new Set(prev);
      next.add(stopKey);
      return next;
    });
    // Reflect the selection in the URL so a refresh keeps the user in place.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("brand", brandSlug);
    params.set("step", stepId);
    router.replace(`?${params.toString()}`);
  };

  const handleSave = async (card: ContentCard, cardIndex?: number) => {
    if (!selectedStepId) return;
    await saveCard(selectedStepId, card, cardIndex);
    router.refresh();
    setToast(typeof cardIndex === "number" ? "Card updated" : "Card added");
  };

  const handleDelete = (cardIndex: number) => {
    if (!selectedStepId) return;
    if (
      !confirm(
        "Delete this card? This removes it from the candidate portal immediately.",
      )
    ) {
      return;
    }
    startDeleting(async () => {
      await deleteCard(selectedStepId, cardIndex);
      router.refresh();
      setToast("Card deleted");
    });
  };

  const previewHref = candidateTokenForPreview
    ? `/portal/${candidateTokenForPreview}`
    : null;

  return (
    <div className="adm-content-shell">
      {/* ---- Left rail: stops + steps ---- */}
      <aside className="adm-rail">
        <div className="adm-rail-head">
          <div className="adm-rail-eyebrow">Editing</div>
          <div className="adm-rail-brand">{brandName}</div>
        </div>
        <nav className="adm-rail-stops">
          {stops.map((stop) => {
            const expanded = expandedStops.has(stop.stop_key);
            const steps = stepsByStop[stop.stop_key] ?? [];
            return (
              <div key={stop.stop_key} className="adm-rail-stop">
                <button
                  type="button"
                  className="adm-rail-stop-head"
                  onClick={() => toggleStop(stop.stop_key)}
                >
                  <span className="adm-rail-stop-caret">
                    {expanded ? "▾" : "▸"}
                  </span>
                  <span className="adm-rail-stop-num">
                    {stop.position + 1}
                  </span>
                  <span className="adm-rail-stop-label">{stop.label}</span>
                </button>
                {expanded && (
                  <ul className="adm-rail-steps">
                    {steps.map((step) => {
                      const active = selectedStepId === step.id;
                      const count =
                        step.content_type === "slides"
                          ? step.slides.length
                          : step.content_cards.length;
                      return (
                        <li key={step.id}>
                          <button
                            type="button"
                            className={`adm-rail-step${active ? " active" : ""}`}
                            onClick={() => selectStep(step.id, stop.stop_key)}
                          >
                            <span className="adm-rail-step-label">
                              {step.label}
                            </span>
                            {count > 0 && (
                              <span className="adm-rail-step-count">
                                {count}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ---- Right pane: cards on selected step ---- */}
      <section className="adm-editor-pane">
        {!selectedStep ? (
          <div className="adm-empty">
            <p>Select a step on the left to edit its cards.</p>
          </div>
        ) : (
          <>
            <header className="adm-editor-head">
              <div>
                <div className="adm-editor-eyebrow">
                  Stop {stopNumber} · Step {stepNumber}
                </div>
                <h1 className="adm-editor-title">{selectedStep.label}</h1>
                <p className="adm-editor-desc">{selectedStep.description}</p>
              </div>
              {previewHref && (
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="adm-btn-ghost"
                >
                  See in candidate portal ↗
                </a>
              )}
            </header>

            {selectedStep.content_type === "slides" ? (
              <SlideEditor
                key={selectedStep.id}
                brandSlug={brandSlug}
                stepId={selectedStep.id}
                initialSlides={selectedStep.slides}
                saveSlides={saveSlides}
                upload={uploadSlide}
              />
            ) : selectedStep.content_type === "application" ? (
              <div className="adm-notice">
                <div className="adm-notice-eyebrow">Not user-editable</div>
                <p>
                  Application content is managed in code — the 22-question
                  flow, chapters, and field mappings live in the portal
                  repo so changes can be versioned alongside the Zoho field
                  map.
                </p>
              </div>
            ) : (
              <>
                <CardList
                  cards={selectedStep.content_cards}
                  onEdit={(card, idx) =>
                    setEditorState({ mode: "edit", card, cardIndex: idx })
                  }
                  onDelete={handleDelete}
                  deleting={deleting}
                />

                <div className="adm-add-zone">
                  <button
                    type="button"
                    className="adm-btn-primary"
                    onClick={() => setAddMenuOpen((v) => !v)}
                  >
                    + Add card
                  </button>
                  {addMenuOpen && (
                    <div className="adm-add-menu" role="menu">
                      {CARD_TYPES.map(({ type, label }) => (
                        <button
                          key={type}
                          type="button"
                          role="menuitem"
                          className="adm-add-menu-item"
                          onClick={() => {
                            setEditorState({ mode: "create", type });
                            setAddMenuOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {editorState && selectedStep && selectedStep.content_type !== "slides" && selectedStep.content_type !== "application" && (
        <CardEditor
          brandSlug={brandSlug}
          initial={
            editorState.mode === "create"
              ? { type: editorState.type, create: true }
              : editorState.card
          }
          cardIndex={
            editorState.mode === "edit" ? editorState.cardIndex : undefined
          }
          onSave={handleSave}
          onCancel={() => setEditorState(null)}
          upload={upload}
        />
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}

// ----- card list -----

interface CardListProps {
  cards: ContentCard[];
  onEdit: (card: ContentCard, idx: number) => void;
  onDelete: (idx: number) => void;
  deleting: boolean;
}

function CardList({ cards, onEdit, onDelete, deleting }: CardListProps) {
  if (cards.length === 0) {
    return (
      <div className="adm-cardlist-empty">
        <p>No cards on this step yet.</p>
      </div>
    );
  }
  return (
    <ul className="adm-cardlist">
      {cards.map((card, i) => (
        <li key={i} className="adm-cardrow">
          <span className={`adm-cardrow-badge adm-cardrow-badge-${card.type}`}>
            {card.type}
          </span>
          <span className="adm-cardrow-summary">{summarize(card)}</span>
          <div className="adm-cardrow-actions">
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => onEdit(card, i)}
            >
              Edit
            </button>
            <button
              type="button"
              className="adm-btn-ghost adm-btn-danger"
              onClick={() => onDelete(i)}
              disabled={deleting}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function summarize(card: ContentCard): string {
  switch (card.type) {
    case "fact":
      return card.headline;
    case "quote":
      return `${card.author} — ${card.role}`;
    case "awards":
      return `${card.items.length} award${card.items.length === 1 ? "" : "s"}`;
    case "personas":
      return `${card.items.length} persona${card.items.length === 1 ? "" : "s"}`;
    case "photo":
      return card.caption ?? "Photo";
  }
}
