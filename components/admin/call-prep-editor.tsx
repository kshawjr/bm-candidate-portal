"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CallPrepRenderer,
  type CallPrepConfig,
  type LinkedScheduleInfo,
} from "@/components/content-types/call-prep-renderer";
import { ImageUpload } from "./image-upload";

type UploadFn = (
  brandSlug: string,
  formData: FormData,
) => Promise<{ url: string } | { error: string }>;

/** Shape the editor needs to populate the linked-step dropdown and resolve
 * {call_type}/{duration} placeholders in the preview. */
export interface AvailableScheduleStep {
  id: string;
  label: string;
  event_label: string;
  duration_minutes: number;
}

interface Props {
  brandSlug: string;
  brandName: string;
  brandShortName: string;
  stepId: string;
  initialConfig: CallPrepConfig;
  availableScheduleSteps: AvailableScheduleStep[];
  saveConfig: (stepId: string, config: CallPrepConfig) => Promise<void>;
  uploadImage: UploadFn;
}

const DEFAULT_CONFIG: CallPrepConfig = {
  linked_schedule_step_id: null,
  heading: "Before your call",
  subheading: "What to expect",
  description: "",
  hero_image_url: null,
  what_well_cover: [""],
  come_prepared: [""],
  partner_callout_text: "",
  cta_label: "Ready to book",
};

const PLACEHOLDER_HINT =
  "Available placeholders: {call_type}, {call_type_lower}, {duration}, {rep_name}, {rep_first_name}, {brand_name}, {brand_short_name}, {candidate_first_name}";

function normalize(raw: unknown): CallPrepConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const r = raw as Record<string, unknown>;
  const asStringArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  return {
    linked_schedule_step_id:
      typeof r.linked_schedule_step_id === "string" &&
      r.linked_schedule_step_id.length > 0
        ? r.linked_schedule_step_id
        : null,
    heading:
      typeof r.heading === "string" ? r.heading : DEFAULT_CONFIG.heading,
    subheading:
      typeof r.subheading === "string"
        ? r.subheading
        : DEFAULT_CONFIG.subheading,
    description: typeof r.description === "string" ? r.description : "",
    hero_image_url:
      typeof r.hero_image_url === "string" && r.hero_image_url.length > 0
        ? r.hero_image_url
        : null,
    what_well_cover: asStringArr(r.what_well_cover),
    come_prepared: asStringArr(r.come_prepared),
    partner_callout_text:
      typeof r.partner_callout_text === "string"
        ? r.partner_callout_text
        : "",
    cta_label:
      typeof r.cta_label === "string" && r.cta_label.trim().length > 0
        ? r.cta_label
        : DEFAULT_CONFIG.cta_label,
  };
}

export function CallPrepEditor({
  brandSlug,
  brandName,
  brandShortName,
  stepId,
  initialConfig,
  availableScheduleSteps,
  saveConfig,
  uploadImage,
}: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<CallPrepConfig>(() =>
    normalize(initialConfig),
  );
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfig(normalize(initialConfig));
  }, [initialConfig, stepId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const linkedStep = useMemo(
    () =>
      config.linked_schedule_step_id
        ? availableScheduleSteps.find(
            (s) => s.id === config.linked_schedule_step_id,
          ) ?? null
        : null,
    [config.linked_schedule_step_id, availableScheduleSteps],
  );

  // Preview uses the linked step's real values when available; otherwise
  // a sensible demo fallback so the admin still sees resolved copy.
  const previewSchedule: LinkedScheduleInfo = linkedStep
    ? {
        eventLabel: linkedStep.event_label,
        durationMinutes: linkedStep.duration_minutes,
      }
    : { eventLabel: "Discovery Call", durationMinutes: 30 };

  const dirty =
    JSON.stringify(config) !== JSON.stringify(normalize(initialConfig));

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveConfig(stepId, config);
        setToast("Call prep saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const updateList = (
    key: "what_well_cover" | "come_prepared",
    next: string[],
  ) => {
    setConfig({ ...config, [key]: next });
  };

  return (
    <div className="adm-call-prep-editor">
      <section className="adm-call-prep-preview">
        <div className="adm-upload-purpose">Preview</div>
        <CallPrepRenderer
          config={config}
          linkedSchedule={previewSchedule}
          repName="Kevin Shaw"
          brandName={brandName}
          brandShortName={brandShortName}
          candidateFirstName="Jamie"
          onComplete={() => setToast("(Preview — candidates see this button)")}
        />
      </section>

      <section className="adm-call-prep-form">
        {availableScheduleSteps.length === 0 && (
          <div className="adm-notice">
            <div className="adm-notice-eyebrow">No schedule step nearby</div>
            <p>
              This chapter doesn&apos;t have a schedule step yet. Add a
              schedule step to the same chapter first, then come back to
              link it here — the call prep needs one to resolve{" "}
              <code>{"{call_type}"}</code> and <code>{"{duration}"}</code>.
            </p>
          </div>
        )}

        <div className="adm-field">
          <span className="adm-form-label">
            Linked schedule step{" "}
            {!config.linked_schedule_step_id && (
              <span className="structure-chip" style={{ marginLeft: 8 }}>
                Not linked
              </span>
            )}
          </span>
          <select
            className="adm-input"
            value={config.linked_schedule_step_id ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                linked_schedule_step_id: e.target.value || null,
              })
            }
          >
            <option value="">— pick a schedule step —</option>
            {availableScheduleSteps.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.event_label}, {s.duration_minutes}m)
              </option>
            ))}
          </select>
          <span className="adm-form-hint">
            The booking step this prep content previews. Drives{" "}
            <code>{"{call_type}"}</code> and{" "}
            <code>{"{duration}"}</code> in the copy below.
          </span>
        </div>

        <label className="adm-field">
          <span className="adm-form-label">
            Heading{" "}
            <span className="adm-form-required" aria-hidden="true">
              *
            </span>
          </span>
          <input
            type="text"
            className="adm-input"
            value={config.heading}
            onChange={(e) => setConfig({ ...config, heading: e.target.value })}
            placeholder="Before your call"
          />
        </label>

        <label className="adm-field">
          <span className="adm-form-label">Subheading</span>
          <input
            type="text"
            className="adm-input"
            value={config.subheading}
            onChange={(e) =>
              setConfig({ ...config, subheading: e.target.value })
            }
            placeholder="What to expect"
          />
        </label>

        <label className="adm-field">
          <span className="adm-form-label">Description</span>
          <textarea
            className="adm-textarea"
            rows={4}
            value={config.description}
            onChange={(e) =>
              setConfig({ ...config, description: e.target.value })
            }
            placeholder="Short intro paragraph — you can reference {call_type}, {duration}, etc. Use a blank line to break paragraphs."
          />
          <span className="adm-form-hint">{PLACEHOLDER_HINT}</span>
        </label>

        <ImageUpload
          label="Hero image (optional)"
          value={config.hero_image_url}
          onChange={(url) =>
            setConfig({ ...config, hero_image_url: url ?? null })
          }
          brandSlug={brandSlug}
          onUpload={uploadImage}
          purpose="Call prep hero"
          recommendedSize="1600 × 900 px (16:9)"
          recommendedFormat="JPG or PNG"
          maxSizeMB={2}
        />

        <BulletListField
          label="What we'll cover"
          bullets={config.what_well_cover}
          onChange={(next) => updateList("what_well_cover", next)}
          placeholder="e.g. Your timeline and what you're looking for"
        />

        <BulletListField
          label="Come prepared"
          bullets={config.come_prepared}
          onChange={(next) => updateList("come_prepared", next)}
          placeholder="e.g. Jot down any questions about the brand"
        />

        <label className="adm-field">
          <span className="adm-form-label">Partner callout text</span>
          <textarea
            className="adm-textarea"
            rows={3}
            value={config.partner_callout_text}
            onChange={(e) =>
              setConfig({
                ...config,
                partner_callout_text: e.target.value,
              })
            }
            placeholder="Leave blank to hide. If you have a spouse, partner, or co-investor — bring them along."
          />
          <span className="adm-form-hint">
            Shows as an animated callout with a 👥 icon. Leave blank to hide.
          </span>
        </label>

        <label className="adm-field">
          <span className="adm-form-label">CTA label</span>
          <input
            type="text"
            className="adm-input"
            value={config.cta_label}
            onChange={(e) =>
              setConfig({ ...config, cta_label: e.target.value })
            }
            placeholder="Ready to book"
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
            disabled={!dirty || pending}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}

function BulletListField({
  label,
  bullets,
  onChange,
  placeholder,
}: {
  label: string;
  bullets: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= bullets.length) return;
    const next = [...bullets];
    const [moved] = next.splice(i, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };
  const setAt = (i: number, value: string) => {
    const next = [...bullets];
    next[i] = value;
    onChange(next);
  };
  const removeAt = (i: number) => {
    onChange(bullets.filter((_, idx) => idx !== i));
  };
  const add = () => onChange([...bullets, ""]);

  return (
    <div className="adm-field">
      <span className="adm-form-label">{label}</span>
      <div className="adm-call-prep-bullets">
        {bullets.length === 0 && (
          <div className="adm-muted" style={{ fontSize: 13 }}>
            No bullets yet.
          </div>
        )}
        {bullets.map((b, i) => (
          <div key={i} className="adm-call-prep-bullet">
            <input
              type="text"
              className="adm-input"
              value={b}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={placeholder}
            />
            <button
              type="button"
              className="adm-icon-btn"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move bullet up"
            >
              ↑
            </button>
            <button
              type="button"
              className="adm-icon-btn"
              onClick={() => move(i, 1)}
              disabled={i === bullets.length - 1}
              aria-label="Move bullet down"
            >
              ↓
            </button>
            <button
              type="button"
              className="adm-btn-ghost adm-btn-danger"
              onClick={() => removeAt(i)}
              aria-label="Remove bullet"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <button type="button" className="adm-btn-ghost" onClick={add}>
          + Add bullet
        </button>
      </div>
    </div>
  );
}
