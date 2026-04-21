"use client";

import {
  buildTemplateContext,
  resolveTemplate,
  type TemplateContext,
} from "@/lib/template-resolver";

export interface CallPrepConfig {
  linked_schedule_step_id: string | null;
  heading: string;
  subheading: string;
  description: string;
  hero_image_url: string | null;
  what_well_cover: string[];
  come_prepared: string[];
  partner_callout_enabled: boolean;
  partner_callout_text: string;
  cta_label: string;
}

/** Minimal shape the renderer needs from the linked schedule step. */
export interface LinkedScheduleInfo {
  eventLabel: string;
  durationMinutes: number;
}

interface Props {
  config: CallPrepConfig;
  linkedSchedule: LinkedScheduleInfo | null;
  repName: string | null;
  brandName: string;
  brandShortName: string;
  candidateFirstName: string | null;
  onComplete: () => void;
}

export function CallPrepRenderer({
  config,
  linkedSchedule,
  repName,
  brandName,
  brandShortName,
  candidateFirstName,
  onComplete,
}: Props) {
  const ctx: TemplateContext = buildTemplateContext({
    callType: linkedSchedule?.eventLabel ?? null,
    durationMinutes: linkedSchedule?.durationMinutes ?? null,
    repName,
    brandName,
    brandShortName,
    candidateFirstName,
  });

  const r = (text: string) => resolveTemplate(text, ctx);

  const whatWellCover = (config.what_well_cover ?? []).filter(
    (b) => b && b.trim().length > 0,
  );
  const comePrepared = (config.come_prepared ?? []).filter(
    (b) => b && b.trim().length > 0,
  );

  return (
    <div className="call-prep-renderer">
      <header className="call-prep-head">
        <h2 className="call-prep-heading">{r(config.heading)}</h2>
        {config.subheading && (
          <p className="call-prep-subheading">{r(config.subheading)}</p>
        )}
      </header>

      {config.description && (
        <p className="call-prep-description">{r(config.description)}</p>
      )}

      {config.hero_image_url && (
        <div className="call-prep-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.hero_image_url} alt="" />
        </div>
      )}

      {whatWellCover.length > 0 && (
        <section className="call-prep-section">
          <h3 className="call-prep-section-title">What we&apos;ll cover</h3>
          <ul className="call-prep-list">
            {whatWellCover.map((b, i) => (
              <li key={i}>{r(b)}</li>
            ))}
          </ul>
        </section>
      )}

      {comePrepared.length > 0 && (
        <section className="call-prep-section">
          <h3 className="call-prep-section-title">Come prepared</h3>
          <ul className="call-prep-list">
            {comePrepared.map((b, i) => (
              <li key={i}>{r(b)}</li>
            ))}
          </ul>
        </section>
      )}

      {config.partner_callout_enabled && config.partner_callout_text && (
        <aside className="call-prep-callout" role="note">
          <div className="call-prep-callout-icon" aria-hidden="true">
            👥
          </div>
          <p className="call-prep-callout-text">
            {r(config.partner_callout_text)}
          </p>
        </aside>
      )}

      <div className="call-prep-cta-row">
        <button
          type="button"
          className="slide-nav-btn primary"
          onClick={onComplete}
        >
          {(config.cta_label && config.cta_label.trim()) || "Ready to book"}{" "}
          →
        </button>
      </div>
    </div>
  );
}
