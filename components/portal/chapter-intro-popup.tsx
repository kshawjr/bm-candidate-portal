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

export interface ScarcityFraming {
  /** May contain `{slots}` — replaced at render time with the random
   *  number from `slotsRemaining`, or with an empty string when
   *  `slotsRemaining` is null. */
  heading: string;
  body: string;
}

export interface SlotsRemainingRange {
  min: number;
  max: number;
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
  /** F2 follow-up: heading + body of the "By invitation only" scarcity
   *  block on first_chat. null → fall back to the legacy hardcoded
   *  copy below so brands keep working until they're edited. */
  scarcityFraming: ScarcityFraming | null;
  /** F2 follow-up: range for the random "N more candidates" count.
   *  null → omit the count from the heading entirely (replace `{slots}`
   *  with empty string). */
  slotsRemaining: SlotsRemainingRange | null;
  /** F2 follow-up: helper text when the pre-dismiss checklist isn't
   *  fully ticked. null/blank → fall back to the legacy copy. */
  continueHint: string | null;
}

// Legacy fallbacks. The migration leaves scarcityFraming + continueHint
// null on existing rows so brands that haven't been edited render the
// same copy they always did.
const DEFAULT_SCARCITY_HEADING =
  "We're only taking {slots} more candidates this month.";
const DEFAULT_SCARCITY_BODY = "Selective intake. Serious candidates only.";
const DEFAULT_CONTINUE_HINT = "Check the items above to continue";

export const FALLBACK_SCARCITY: ScarcityFraming = {
  heading: DEFAULT_SCARCITY_HEADING,
  body: DEFAULT_SCARCITY_BODY,
};
export const FALLBACK_CONTINUE_HINT = DEFAULT_CONTINUE_HINT;

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

  // F2 follow-up: scarcity framing visibility still gated on first_chat
  // (preserves PR 41 behavior). Content + slot range now configurable;
  // hardcoded fallbacks live in the constants above for un-edited brands.
  const isFirstChat = config.chapterKey === "first_chat";
  const slotsRange = config.slotsRemaining;
  const slotsRemaining = useMemo(() => {
    if (!isFirstChat || !slotsRange) return null;
    const min = Math.max(1, Math.floor(slotsRange.min));
    const max = Math.max(min, Math.floor(slotsRange.max));
    return Math.floor(Math.random() * (max - min + 1)) + min;
    // Stable per mount — recompute only if the range itself changes,
    // which never happens during a single popup lifetime in practice.
  }, [isFirstChat, slotsRange]);

  const scarcity = config.scarcityFraming ?? FALLBACK_SCARCITY;
  // Split on `{slots}` so the slot count keeps the large-number visual
  // treatment (`.pp-popup-scarcity-num`) instead of becoming inline plain
  // text. Multiple tokens are supported, but admins shouldn't need more
  // than one.
  const scarcityHeadingNodes = scarcity.heading
    .split(/(\{slots\})/)
    .map((part, i) => {
      if (part !== "{slots}") return <span key={i}>{part}</span>;
      if (slotsRemaining === null) return null;
      return (
        <span key={i} className="pp-popup-scarcity-num">
          {slotsRemaining}
        </span>
      );
    });

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
                {scarcityHeadingNodes}
              </h2>
              <p className="pp-popup-scarcity-sub">{scarcity.body}</p>
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
                {config.continueHint?.trim() || FALLBACK_CONTINUE_HINT}
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
