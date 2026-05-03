"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { renderMiniMarkdown } from "@/lib/mini-markdown";

export interface ChapterIntroBullet {
  icon: string;
  text: string;
}

export interface PreDismissChecklist {
  heading: string;
  items: string[];
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
  /** PR 40: optional pre-dismiss checklist. When present, the dismiss CTA
   *  is disabled until every item is checked. Used by Chapter 2 to gate
   *  booking on a few "I commit" affirmations. */
  preDismissChecklist: PreDismissChecklist | null;
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
  // PR 40: pre-dismiss checklist state. Each item is a boolean keyed by
  // index. CTA gates on every item being true.
  const checklistItems = config.preDismissChecklist?.items ?? [];
  const [checkedFlags, setCheckedFlags] = useState<boolean[]>(
    () => checklistItems.map(() => false),
  );
  const allChecked =
    checklistItems.length === 0 ||
    checkedFlags.length === checklistItems.length &&
      checkedFlags.every(Boolean);

  // PR 41: scarcity framing on the Chapter 2 intro popup. Random integer
  // 2..5 inclusive, stable per mount via useMemo so the number doesn't
  // shift on every re-render. Other chapters don't get this treatment —
  // it's specifically for the Discovery Call booking moment.
  const isFirstChat = config.chapterKey === "first_chat";
  const slotsRemaining = useMemo(
    () => (isFirstChat ? Math.floor(Math.random() * 4) + 2 : 0),
    [isFirstChat],
  );

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
    if (!allChecked) return; // gated by checklist when present
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
  // When a pre-dismiss checklist is gating the popup, ESC is inert too —
  // candidates have to actually check the boxes to proceed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") triggerDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChecked]);

  const toggleChecklistItem = (i: number) => {
    setCheckedFlags((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

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
          {isFirstChat && (
            <div className="pp-popup-scarcity" aria-live="polite">
              <span className="pp-popup-scarcity-pill">By invitation only</span>
              <h2 className="pp-popup-scarcity-headline">
                Only{" "}
                <span className="pp-popup-scarcity-num">
                  {slotsRemaining}
                </span>{" "}
                discovery call slot{slotsRemaining === 1 ? "" : "s"} remaining
                this month.
              </h2>
              <p className="pp-popup-scarcity-sub">
                Limited slots. Serious candidates only.
              </p>
            </div>
          )}
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

          {config.preDismissChecklist && checklistItems.length > 0 && (
            <div className="pp-popup-checklist">
              <div className="pp-popup-checklist-heading">
                {config.preDismissChecklist.heading}
              </div>
              <ul className="pp-popup-checklist-list">
                {checklistItems.map((item, i) => {
                  const checked = checkedFlags[i] ?? false;
                  return (
                    <li
                      key={i}
                      className={`pp-popup-checklist-item${checked ? " is-checked" : ""}`}
                    >
                      <button
                        type="button"
                        className="pp-popup-checklist-row"
                        onClick={() => toggleChecklistItem(i)}
                        aria-pressed={checked}
                      >
                        <span
                          className="pp-popup-checklist-box"
                          aria-hidden="true"
                        >
                          {checked ? "✓" : ""}
                        </span>
                        <span className="pp-popup-checklist-text">
                          {item}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="pp-popup-foot pp-popup-foot-checklist">
            {config.preDismissChecklist && !allChecked && (
              <span className="pp-popup-cta-hint">
                Check the items above to continue
              </span>
            )}
            <button
              type="button"
              className={`pp-popup-cta${
                config.preDismissChecklist && allChecked
                  ? " is-pulsing"
                  : ""
              }`}
              onClick={triggerDismiss}
              disabled={pending || closing || !allChecked}
            >
              {pending ? "…" : config.ctaDismissLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
