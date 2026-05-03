"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { renderMiniMarkdown } from "@/lib/mini-markdown";
import type { ChapterIntroBullet } from "@/components/portal/chapter-intro-popup";

export interface ChapterIntroBannerConfig {
  chapterKey: string;
  heading: string;
  bodyMd: string;
  heroImageUrl: string | null;
  bullets: ChapterIntroBullet[];
  /** PR 38: optional partner-callout. Rendered with extra emphasis,
   *  same content the popup shows but compact for the persistent banner. */
  partnerCalloutText: string | null;
}

interface Props {
  config: ChapterIntroBannerConfig;
}

/**
 * Pull the first 1-2 sentences out of the body for the peek state. Splits
 * on sentence boundaries (period + whitespace). If the first sentence alone
 * already runs long (> 150 chars), hard-truncate at 150 with an ellipsis
 * so the peek stays compact.
 */
function bodyPeek(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  const sentences = trimmed.split(/(?<=\.)\s+/);
  let out = sentences[0] ?? "";
  if (out.length < 80 && sentences[1]) {
    out = `${out} ${sentences[1]}`;
  }
  if (out.length > 160) {
    out = out.slice(0, 150).trimEnd() + "…";
  }
  // Avoid showing peek text that's identical to the full body — pointless
  // "See more" affordance.
  return out;
}

/**
 * Persistent chapter overview banner. Reads from the same chapter_intro_popups
 * row as the popup, but is always visible at the top of the chapter content
 * area (independent of whether the popup itself was dismissed).
 *
 * Local state only — peek/expanded reset on page refresh. Each instance is
 * keyed by chapter_key so navigating between chapters resets state.
 *
 * PR 41: defaults to PEEK mode — heading + first 1-2 sentences + "See more"
 * link. Click "See more" to expand to the full content (bullets, partner
 * callout, etc.). Replaces PR 40's fully-collapsed default, which read as
 * dismissive of the chapter context.
 */
export function ChapterIntroBanner({ config }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Reset to defaults whenever the chapter changes — the parent re-keys
  // the component but this is belt-and-suspenders if React reuses the
  // instance.
  useEffect(() => {
    setExpanded(false);
  }, [config.chapterKey]);

  const fullBodyHtml = renderMiniMarkdown(config.bodyMd);
  const peek = bodyPeek(config.bodyMd);
  const peekIsTruncated = peek.length < config.bodyMd.trim().length;
  // Even when the peek text covers the full body, we still want "See more"
  // if there's bullets / partner callout / hero image hidden in expanded.
  const hasMoreToShow =
    peekIsTruncated ||
    config.bullets.length > 0 ||
    Boolean(config.partnerCalloutText) ||
    Boolean(config.heroImageUrl);

  if (!expanded) {
    return (
      <div
        className="cine-intro-banner cine-intro-banner-peek"
        role="region"
        aria-label="Chapter overview"
      >
        <div className="cine-intro-banner-body">
          <h2 className="cine-intro-banner-heading">{config.heading}</h2>
          {peek && (
            <p className="cine-intro-banner-peek-text">{peek}</p>
          )}
          {hasMoreToShow && (
            <button
              type="button"
              className="cine-intro-banner-readmore"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
            >
              See more <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="cine-intro-banner"
      role="region"
      aria-label="Chapter overview"
    >
      {config.heroImageUrl && (
        <div className="cine-intro-banner-hero">
          <Image
            src={config.heroImageUrl}
            alt=""
            width={480}
            height={270}
            className="cine-intro-banner-hero-img"
          />
        </div>
      )}

      <div className="cine-intro-banner-body">
        <div className="cine-intro-banner-head">
          <h2 className="cine-intro-banner-heading">{config.heading}</h2>
          <button
            type="button"
            className="cine-intro-banner-collapse"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-label="Show less"
            title="Show less"
          >
            <span aria-hidden="true">↑</span>
          </button>
        </div>

        {fullBodyHtml && (
          <div
            className="cine-intro-banner-prose"
            dangerouslySetInnerHTML={{ __html: fullBodyHtml }}
          />
        )}

        {config.bullets.length > 0 && (
          <ul className="cine-intro-banner-bullets">
            {config.bullets.map((b, i) => (
              <li key={i} className="cine-intro-banner-bullet">
                <span
                  className="cine-intro-banner-bullet-icon"
                  aria-hidden="true"
                >
                  {b.icon || "•"}
                </span>
                <span className="cine-intro-banner-bullet-text">{b.text}</span>
              </li>
            ))}
          </ul>
        )}

        {config.partnerCalloutText && (
          <div className="cine-intro-banner-callout">
            <span
              className="cine-intro-banner-callout-icon"
              aria-hidden="true"
            >
              👥
            </span>
            <p className="cine-intro-banner-callout-text">
              {config.partnerCalloutText}
            </p>
          </div>
        )}

        <button
          type="button"
          className="cine-intro-banner-readmore"
          onClick={() => setExpanded(false)}
          aria-expanded={true}
        >
          See less <span aria-hidden="true">↑</span>
        </button>
      </div>
    </div>
  );
}
