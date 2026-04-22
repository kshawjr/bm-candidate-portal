"use client";

import { useEffect, useRef, useState } from "react";
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

  const descriptionParas = (config.description ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const whatWellCover = (config.what_well_cover ?? []).filter(
    (b) => b && b.trim().length > 0,
  );
  const comePrepared = (config.come_prepared ?? []).filter(
    (b) => b && b.trim().length > 0,
  );
  const calloutText =
    typeof config.partner_callout_text === "string"
      ? config.partner_callout_text.trim()
      : "";

  // Reveal the partner callout when it scrolls into view. Fires once; the
  // observer disconnects after the first intersection so the class never
  // un-applies. CSS handles the actual fade/slide + reduced-motion opt-out.
  const calloutRef = useRef<HTMLElement | null>(null);
  const [calloutVisible, setCalloutVisible] = useState(false);
  useEffect(() => {
    const el = calloutRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setCalloutVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCalloutVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="call-prep-renderer">
      <header className="call-prep-head">
        <h2 className="call-prep-heading">{r(config.heading)}</h2>
        {config.subheading && (
          <p className="call-prep-subheading">{r(config.subheading)}</p>
        )}
      </header>

      {config.hero_image_url && (
        <div className="call-prep-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.hero_image_url} alt="" />
        </div>
      )}

      {descriptionParas.length > 0 && (
        <div className="call-prep-description">
          {descriptionParas.map((p, i) => (
            <p key={i}>{r(p)}</p>
          ))}
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

      {calloutText.length > 0 && (
        <aside
          ref={calloutRef}
          className={`call-prep-callout${calloutVisible ? " is-visible" : ""}`}
          role="note"
        >
          <div className="call-prep-callout-icon" aria-hidden="true">
            👥
          </div>
          <p className="call-prep-callout-text">{r(calloutText)}</p>
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
