"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ContentCard } from "@/components/content-cards/types";
import type { Slide } from "@/components/content-types/slides-renderer";
import type { StepFormData } from "@/app/admin/structure/actions";
import { CardEditor } from "./card-editor";
import { SlideEditor } from "./slide-editor";
import { StepsManager, type AdminStepRow } from "./steps-manager";
import { VideoEditor } from "./video-editor";
import { ScheduleEditor } from "./schedule-editor";
import {
  CallPrepEditor,
  type AvailableScheduleStep,
} from "./call-prep-editor";
import type { VideoConfig } from "@/components/content-types/video-renderer";
import type { CallPrepConfig } from "@/components/content-types/call-prep-renderer";
import type { ScheduleConfig } from "@/lib/schedule-shared";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

export interface AdminStop {
  id: string;
  stop_key: string;
  position: number;
  label: string;
  name: string;
  is_archived: boolean;
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
  config: Record<string, unknown>;
  is_archived: boolean;
}

interface Props {
  brandId: string;
  brandSlug: string;
  brandName: string;
  stops: AdminStop[];
  stepsByStop: Record<string, AdminStep[]>;
  initialStepId: string | null;
  initialStopKey: string | null;
  saveCard: (
    stepId: string,
    card: ContentCard,
    cardIndex?: number,
  ) => Promise<void>;
  deleteCard: (stepId: string, cardIndex: number) => Promise<void>;
  saveSlides: (stepId: string, slides: Slide[]) => Promise<void>;
  saveStepConfig: (stepId: string, config: Record<string, unknown>) => Promise<void>;
  upload: UploadFn;
  uploadSlide: UploadFn;
  uploadVideo: UploadFn;
  uploadCallPrep: UploadFn;
  candidateTokenForPreview: string | null;
  isGCalConfigured: boolean;
  brandShortName: string;
  createStep: (
    brandId: string,
    stopKey: string,
    data: StepFormData,
  ) => Promise<string>;
  updateStep: (
    stepId: string,
    data: Omit<StepFormData, "step_key"> & { confirmTypeReset?: boolean },
  ) => Promise<void>;
  deleteStep: (stepId: string) => Promise<void>;
  archiveStep: (stepId: string, archived: boolean) => Promise<void>;
  reorderSteps: (
    brandId: string,
    stopKey: string,
    orderedStepIds: string[],
  ) => Promise<void>;
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
  brandId,
  brandSlug,
  brandName,
  stops,
  stepsByStop,
  initialStepId,
  initialStopKey,
  saveCard,
  deleteCard,
  saveSlides,
  saveStepConfig,
  upload,
  uploadSlide,
  uploadVideo,
  uploadCallPrep,
  candidateTokenForPreview,
  isGCalConfigured,
  brandShortName,
  createStep,
  updateStep,
  deleteStep,
  archiveStep,
  reorderSteps,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const allSteps = useMemo(
    () => flattenSteps(stops, stepsByStop),
    [stops, stepsByStop],
  );

  // Resolve initial selection: step wins over stop; otherwise fall back to
  // nothing and let the user pick.
  const initialStep =
    initialStepId ? allSteps.find((s) => s.id === initialStepId) : null;
  const initialResolvedStopKey =
    initialStep?.stop_key ?? initialStopKey ?? null;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    initialStep?.id ?? null,
  );
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(
    initialStep ? initialStep.stop_key : initialStopKey,
  );

  const [expandedStops, setExpandedStops] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (initialResolvedStopKey) initial.add(initialResolvedStopKey);
    return initial;
  });

  const [editorState, setEditorState] = useState<
    | null
    | { mode: "create"; type: ContentCard["type"] }
    | { mode: "edit"; card: ContentCard; cardIndex: number }
  >(null);

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

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
    : selectedStopKey
      ? stops.find((s) => s.stop_key === selectedStopKey) ?? null
      : null;

  const stopNumber = selectedStop ? selectedStop.position + 1 : null;
  const stepNumber = selectedStep ? selectedStep.position + 1 : null;

  const updateUrl = (stopKey: string | null, stepId: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("brand", brandSlug);
    if (stepId) {
      params.set("step", stepId);
      params.delete("stop");
    } else if (stopKey) {
      params.set("stop", stopKey);
      params.delete("step");
    } else {
      params.delete("stop");
      params.delete("step");
    }
    router.replace(`?${params.toString()}`);
  };

  const selectStop = (stopKey: string) => {
    setSelectedStopKey(stopKey);
    setSelectedStepId(null);
    setEditorState(null);
    setAddMenuOpen(false);
    setExpandedStops((prev) => {
      const next = new Set(prev);
      next.add(stopKey);
      return next;
    });
    updateUrl(stopKey, null);
  };

  const toggleStopExpansion = (stopKey: string) => {
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stopKey)) next.delete(stopKey);
      else next.add(stopKey);
      return next;
    });
  };

  const selectStep = (stepId: string, stopKey: string) => {
    setSelectedStepId(stepId);
    setSelectedStopKey(null);
    setEditorState(null);
    setAddMenuOpen(false);
    setExpandedStops((prev) => {
      const next = new Set(prev);
      next.add(stopKey);
      return next;
    });
    updateUrl(null, stepId);
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

  const stepsForSelectedStop: AdminStepRow[] = selectedStop
    ? (stepsByStop[selectedStop.stop_key] ?? []).map((s) => ({
        id: s.id,
        step_key: s.step_key,
        position: s.position,
        label: s.label,
        description: s.description,
        content_type: s.content_type,
        is_archived: s.is_archived,
      }))
    : [];

  return (
    <div className="adm-content-shell">
      <aside className="adm-rail">
        <div className="adm-rail-head">
          <div className="adm-rail-eyebrow">Editing</div>
          <div className="adm-rail-brand">{brandName}</div>
        </div>
        <nav className="adm-rail-stops">
          {stops.map((stop) => {
            const expanded = expandedStops.has(stop.stop_key);
            const steps = stepsByStop[stop.stop_key] ?? [];
            const stopActive =
              selectedStopKey === stop.stop_key && !selectedStepId;
            return (
              <div
                key={stop.stop_key}
                className={`adm-rail-stop${stop.is_archived ? " archived" : ""}`}
              >
                <div className="adm-rail-stop-head-row">
                  <button
                    type="button"
                    className="adm-rail-stop-caret-btn"
                    onClick={() => toggleStopExpansion(stop.stop_key)}
                    aria-label={expanded ? "Collapse stop" : "Expand stop"}
                  >
                    {expanded ? "▾" : "▸"}
                  </button>
                  <button
                    type="button"
                    className={`adm-rail-stop-head${stopActive ? " active" : ""}`}
                    onClick={() => selectStop(stop.stop_key)}
                  >
                    <span className="adm-rail-stop-num">
                      {stop.position + 1}
                    </span>
                    <span className="adm-rail-stop-label">{stop.label}</span>
                    {stop.is_archived && (
                      <span className="structure-chip">Archived</span>
                    )}
                  </button>
                </div>
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
                            className={`adm-rail-step${active ? " active" : ""}${step.is_archived ? " archived" : ""}`}
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

      <section className="adm-editor-pane">
        {!selectedStep && !selectedStop ? (
          <div className="adm-empty">
            <p>Select a stop or step on the left to start editing.</p>
          </div>
        ) : selectedStep ? (
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
            ) : selectedStep.content_type === "video" ? (
              <VideoEditor
                key={selectedStep.id}
                brandSlug={brandSlug}
                stepId={selectedStep.id}
                initialConfig={selectedStep.config as unknown as VideoConfig}
                saveConfig={(stepId, config) =>
                  saveStepConfig(stepId, config as unknown as Record<string, unknown>)
                }
                uploadVideo={uploadVideo}
              />
            ) : selectedStep.content_type === "schedule" ? (
              <ScheduleEditor
                key={selectedStep.id}
                stepId={selectedStep.id}
                initialConfig={selectedStep.config as unknown as ScheduleConfig}
                isGCalConfigured={isGCalConfigured}
                saveConfig={(stepId, config) =>
                  saveStepConfig(stepId, config as unknown as Record<string, unknown>)
                }
              />
            ) : selectedStep.content_type === "call_prep" ? (
              <CallPrepEditor
                key={selectedStep.id}
                brandSlug={brandSlug}
                brandName={brandName}
                brandShortName={brandShortName}
                stepId={selectedStep.id}
                initialConfig={selectedStep.config as unknown as CallPrepConfig}
                availableScheduleSteps={(
                  stepsByStop[selectedStep.stop_key] ?? []
                )
                  .filter(
                    (s) =>
                      s.content_type === "schedule" && !s.is_archived,
                  )
                  .map<AvailableScheduleStep>((s) => {
                    const sc = s.config as Record<string, unknown>;
                    return {
                      id: s.id,
                      label: s.label,
                      event_label:
                        typeof sc?.event_label === "string"
                          ? (sc.event_label as string)
                          : "Discovery Call",
                      duration_minutes:
                        typeof sc?.duration_minutes === "number"
                          ? (sc.duration_minutes as number)
                          : 60,
                    };
                  })}
                saveConfig={(stepId, config) =>
                  saveStepConfig(
                    stepId,
                    config as unknown as Record<string, unknown>,
                  )
                }
                uploadImage={uploadCallPrep}
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
        ) : selectedStop ? (
          <StepsManager
            key={selectedStop.stop_key}
            brandId={brandId}
            brandSlug={brandSlug}
            stopKey={selectedStop.stop_key}
            stopLabel={selectedStop.label}
            stopName={selectedStop.name}
            stopNumber={stopNumber ?? 1}
            steps={stepsForSelectedStop}
            onSelectStep={(stepId) =>
              selectStep(stepId, selectedStop.stop_key)
            }
            createStep={createStep}
            updateStep={updateStep}
            deleteStep={deleteStep}
            archiveStep={archiveStep}
            reorderSteps={reorderSteps}
          />
        ) : null}
      </section>

      {editorState &&
        selectedStep &&
        selectedStep.content_type !== "slides" &&
        selectedStep.content_type !== "application" &&
        selectedStep.content_type !== "video" &&
        selectedStep.content_type !== "schedule" &&
        selectedStep.content_type !== "call_prep" && (
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
