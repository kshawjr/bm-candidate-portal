"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { renderMiniMarkdown } from "@/lib/mini-markdown";

export interface ChapterIntroBullet {
  icon: string;
  text: string;
}

export interface ChapterIntroPopupConfig {
  chapterKey: string;
  heading: string;
  bodyMd: string;
  heroImageUrl: string | null;
  bullets: ChapterIntroBullet[];
  ctaDismissLabel: string;
  /** PR 38: optional callout shown below body/bullets, before the CTA.
   *  Rendered with extra emphasis (tinted background, bigger leading
   *  emoji). Born from the call_prep page's partner-callout pattern. */
  partnerCalloutText: string | null;
}

interface Props {
  config: ChapterIntroPopupConfig;
  /** Called when the user dismisses the popup (CTA, ESC, or backdrop click). */
  onDismiss: (chapterKey: string) => Promise<{ success: boolean }>;
  onDismissed?: () => void;
}

/**
 * Per-chapter intro popup. Less critical than the welcome popup, so it allows
 * Escape and backdrop-click dismissal — the user has already met the brand
 * and shouldn't have to make a deliberate motion every time they reach a new
 * chapter.
 */
export function ChapterIntroPopup({ config, onDismiss, onDismissed }: Props) {
  const [closing, setClosing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Lock page scroll while open. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const triggerDismiss = () => {
    if (pending || closing) return;
    setClosing(true);
    startTransition(async () => {
      const result = await onDismiss(config.chapterKey);
      if (result.success) {
        window.setTimeout(() => {
          onDismissed?.();
        }, 200);
      } else {
        setClosing(false);
      }
    });
  };

  // Escape-to-dismiss. Bound once; re-bound if the closing state flips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bodyHtml = renderMiniMarkdown(config.bodyMd);

  return (
    <div
      className={`pp-popup-backdrop${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-intro-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerDismiss();
      }}
    >
      <div className="pp-popup pp-popup-chapter">
        {config.heroImageUrl && (
          <div className="pp-popup-hero">
            <Image
              src={config.heroImageUrl}
              alt=""
              width={960}
              height={540}
              className="pp-popup-hero-img"
              priority
            />
          </div>
        )}

        <div className="pp-popup-body">
          <h2 id="chapter-intro-heading" className="pp-popup-title">
            {config.heading}
          </h2>

          {bodyHtml && (
            <div
              className="pp-popup-prose"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          )}

          {config.bullets.length > 0 && (
            <ul className="pp-popup-bullets">
              {config.bullets.map((b, i) => (
                <li key={i} className="pp-popup-bullet">
                  <span className="pp-popup-bullet-icon" aria-hidden="true">
                    {b.icon || "•"}
                  </span>
                  <span className="pp-popup-bullet-text">{b.text}</span>
                </li>
              ))}
            </ul>
          )}

          {config.partnerCalloutText && (
            <div className="pp-popup-callout">
              <span
                className="pp-popup-callout-icon"
                aria-hidden="true"
              >
                👥
              </span>
              <p className="pp-popup-callout-text">
                {config.partnerCalloutText}
              </p>
            </div>
          )}

          <div className="pp-popup-foot">
            <button
              type="button"
              className="pp-popup-cta"
              onClick={triggerDismiss}
              disabled={pending || closing}
            >
              {pending ? "…" : config.ctaDismissLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
