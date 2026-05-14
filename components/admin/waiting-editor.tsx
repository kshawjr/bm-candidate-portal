"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  UNLOCK_KEYS,
  UNLOCK_KEY_OPTIONS,
  isValidUnlockKey,
  type UnlockKey,
} from "@/lib/unlock-keys";
import { TEMPLATE_VARS } from "@/lib/template-resolver";
import { WaitingRenderer, type WaitingConfig } from "@/components/content-types/waiting-renderer";

interface Props {
  stepId: string;
  initialConfig: WaitingConfig;
  saveConfig: (stepId: string, config: WaitingConfig) => Promise<void>;
}

// Default lands in place if a brand seeded a waiting step but didn't
// fill anything in yet. Picks discovery_call_unlocked as the most
// common case (Chapter 2 → unlock Chapter 3 webinar etc.); the admin
// will almost always change this to match the chapter's specific gate.
const DEFAULT_CONFIG: WaitingConfig = {
  unlock_key: UNLOCK_KEYS.WEBINAR,
  heading: "Hang tight, {candidate_first_name}",
  subheading: "Your next chapter is on the way",
  show_booking_details: true,
  what_happens_next: [
    "We'll be in touch with the next step soon",
    "Watch your inbox — you'll get an email the moment things open up",
  ],
  next_unlock_preview: {
    label: "Up next",
    description: "A glimpse of what's behind this gate.",
    eta_copy: "Usually opens within a day.",
  },
  expectation_copy: "No need to check back — we'll email you the moment it's open.",
  unlocked_heading: "Your next chapter is ready",
  unlocked_cta_label: "Continue →",
};

function normalize(raw: unknown): WaitingConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONFIG };
  const r = raw as Record<string, unknown>;
  const unlockKeyRaw = r.unlock_key;
  const unlockKey: UnlockKey = isValidUnlockKey(unlockKeyRaw)
    ? unlockKeyRaw
    : DEFAULT_CONFIG.unlock_key;

  const previewRaw =
    r.next_unlock_preview && typeof r.next_unlock_preview === "object"
      ? (r.next_unlock_preview as Record<string, unknown>)
      : {};

  return {
    unlock_key: unlockKey,
    heading: typeof r.heading === "string" ? r.heading : DEFAULT_CONFIG.heading,
    subheading:
      typeof r.subheading === "string" ? r.subheading : DEFAULT_CONFIG.subheading,
    show_booking_details:
      typeof r.show_booking_details === "boolean"
        ? r.show_booking_details
        : DEFAULT_CONFIG.show_booking_details,
    what_happens_next: Array.isArray(r.what_happens_next)
      ? (r.what_happens_next as unknown[])
          .filter((x): x is string => typeof x === "string")
      : [...DEFAULT_CONFIG.what_happens_next],
    next_unlock_preview: {
      label:
        typeof previewRaw.label === "string"
          ? previewRaw.label
          : DEFAULT_CONFIG.next_unlock_preview.label,
      description:
        typeof previewRaw.description === "string"
          ? previewRaw.description
          : DEFAULT_CONFIG.next_unlock_preview.description,
      eta_copy:
        typeof previewRaw.eta_copy === "string"
          ? previewRaw.eta_copy
          : DEFAULT_CONFIG.next_unlock_preview.eta_copy,
    },
    expectation_copy:
      typeof r.expectation_copy === "string"
        ? r.expectation_copy
        : DEFAULT_CONFIG.expectation_copy,
    unlocked_heading:
      typeof r.unlocked_heading === "string"
        ? r.unlocked_heading
        : DEFAULT_CONFIG.unlocked_heading,
    unlocked_cta_label:
      typeof r.unlocked_cta_label === "string"
        ? r.unlocked_cta_label
        : DEFAULT_CONFIG.unlocked_cta_label,
  };
}

export function WaitingEditor({ stepId, initialConfig, saveConfig }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<WaitingConfig>(() =>
    normalize(initialConfig),
  );
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"parked" | "unlocked">(
    "parked",
  );

  useEffect(() => {
    setConfig(normalize(initialConfig));
  }, [initialConfig, stepId]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(normalize(initialConfig)),
    [config, initialConfig],
  );

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveConfig(stepId, config);
        setToast("Saved");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const updateBullet = (i: number, value: string) => {
    setConfig((c) => {
      const next = [...c.what_happens_next];
      next[i] = value;
      return { ...c, what_happens_next: next };
    });
  };
  const addBullet = () => {
    setConfig((c) => ({
      ...c,
      what_happens_next: [...c.what_happens_next, ""],
    }));
  };
  const removeBullet = (i: number) => {
    setConfig((c) => ({
      ...c,
      what_happens_next: c.what_happens_next.filter((_, idx) => idx !== i),
    }));
  };

  return (
    <div className="adm-waiting-editor">
      <div className="adm-notice">
        <div className="adm-notice-eyebrow">How this step routes</div>
        <p>
          Candidates land here after they&apos;ve completed the previous step
          (e.g. booked their discovery call). The card stays in its{" "}
          <strong>parked</strong> state until the candidate&apos;s Lead in Zoho
          gets the matching <code>Portal_Unlocks</code> value added. The
          webhook mirrors that into <code>candidates_in_portal.unlocked_keys</code>,
          and a Supabase realtime subscription flips the card to its{" "}
          <strong>unlocked</strong> state live — no refresh needed.
        </p>
      </div>

      <div className="adm-waiting-grid">
        {/* ---- Form column ---- */}
        <div className="adm-waiting-form">
          <label className="adm-field">
            <span className="adm-form-label">Unlock key (required)</span>
            <select
              className="adm-input"
              value={config.unlock_key}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  unlock_key: e.target.value as UnlockKey,
                }))
              }
            >
              {UNLOCK_KEY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="adm-form-hint">
              Must match a value on the Zoho Lead&apos;s{" "}
              <code>Portal_Unlocks</code> multi-select picklist.
            </span>
          </label>

          <details className="adm-collapse" open>
            <summary>Parked state</summary>

            <label className="adm-field">
              <span className="adm-form-label">Heading</span>
              <input
                className="adm-input"
                type="text"
                value={config.heading}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, heading: e.target.value }))
                }
              />
            </label>

            <label className="adm-field">
              <span className="adm-form-label">Subheading</span>
              <input
                className="adm-input"
                type="text"
                value={config.subheading}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, subheading: e.target.value }))
                }
              />
            </label>

            <label className="adm-field adm-field-row">
              <input
                type="checkbox"
                checked={config.show_booking_details}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    show_booking_details: e.target.checked,
                  }))
                }
              />
              <span>Show the candidate&apos;s booking details</span>
            </label>

            <fieldset className="adm-fieldset">
              <legend>What happens next</legend>
              {config.what_happens_next.map((line, i) => (
                <div key={i} className="adm-bullet-row">
                  <input
                    className="adm-input"
                    type="text"
                    value={line}
                    onChange={(e) => updateBullet(i, e.target.value)}
                  />
                  <button
                    type="button"
                    className="adm-icon-btn"
                    onClick={() => removeBullet(i)}
                    aria-label="Remove bullet"
                    disabled={config.what_happens_next.length <= 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={addBullet}
              >
                + Add a bullet
              </button>
            </fieldset>

            <fieldset className="adm-fieldset">
              <legend>Next chapter preview</legend>

              <label className="adm-field">
                <span className="adm-form-label">Label</span>
                <input
                  className="adm-input"
                  type="text"
                  value={config.next_unlock_preview.label}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      next_unlock_preview: {
                        ...c.next_unlock_preview,
                        label: e.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="adm-field">
                <span className="adm-form-label">Description</span>
                <textarea
                  className="adm-textarea"
                  rows={2}
                  value={config.next_unlock_preview.description}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      next_unlock_preview: {
                        ...c.next_unlock_preview,
                        description: e.target.value,
                      },
                    }))
                  }
                />
              </label>

              <label className="adm-field">
                <span className="adm-form-label">ETA copy</span>
                <input
                  className="adm-input"
                  type="text"
                  value={config.next_unlock_preview.eta_copy}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      next_unlock_preview: {
                        ...c.next_unlock_preview,
                        eta_copy: e.target.value,
                      },
                    }))
                  }
                />
              </label>
            </fieldset>

            <label className="adm-field">
              <span className="adm-form-label">Calming closing line</span>
              <input
                className="adm-input"
                type="text"
                value={config.expectation_copy}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    expectation_copy: e.target.value,
                  }))
                }
              />
            </label>
          </details>

          <details className="adm-collapse">
            <summary>Unlocked state</summary>

            <label className="adm-field">
              <span className="adm-form-label">Heading</span>
              <input
                className="adm-input"
                type="text"
                value={config.unlocked_heading}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    unlocked_heading: e.target.value,
                  }))
                }
              />
            </label>

            <label className="adm-field">
              <span className="adm-form-label">CTA label</span>
              <input
                className="adm-input"
                type="text"
                value={config.unlocked_cta_label}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    unlocked_cta_label: e.target.value,
                  }))
                }
              />
            </label>
          </details>

          <div className="adm-form-hint">
            <strong>Template variables:</strong>{" "}
            {TEMPLATE_VARS.map((v) => `{${v}}`).join(", ")}
          </div>

          <div className="adm-actions">
            <button
              type="button"
              className="adm-btn-primary"
              onClick={handleSave}
              disabled={!dirty || pending}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {toast && <span className="adm-toast">{toast}</span>}
            {error && <span className="adm-error">{error}</span>}
          </div>
        </div>

        {/* ---- Preview column ---- */}
        <div className="adm-waiting-preview">
          <div className="adm-preview-toolbar">
            <div className="adm-preview-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={previewMode === "parked"}
                className={previewMode === "parked" ? "is-active" : ""}
                onClick={() => setPreviewMode("parked")}
              >
                Parked
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={previewMode === "unlocked"}
                className={previewMode === "unlocked" ? "is-active" : ""}
                onClick={() => setPreviewMode("unlocked")}
              >
                Unlocked
              </button>
            </div>
            <span className="adm-preview-hint">Preview state</span>
          </div>
          <div className="adm-preview-frame">
            <WaitingRenderer
              config={config}
              candidateId="preview-only"
              initialUnlockedKeys={[]}
              templateContext={{
                call_type: "Discovery Call",
                duration: "30 minutes",
                rep_first_name: "Sierra",
                brand_short_name: "Hounds Town",
                candidate_first_name: "Jamie",
                discovery_call_date: "Tuesday, May 20",
              }}
              booking={null}
              scheduleConfig={null}
              brandShortName="Hounds Town"
              advisorName="Sierra Jones"
              onContinue={() => {}}
              previewState={previewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
