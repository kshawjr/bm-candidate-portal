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
}

interface Props {
  config: ChapterIntroBannerConfig;
}

/**
 * Persistent chapter overview banner. Reads from the same chapter_intro_popups
 * row as the welcome popup, but is always visible at the top of the chapter
 * content area (independent of whether the popup itself was dismissed).
 *
 * Local state only — collapse + read-more reset on page refresh. Each instance
 * is keyed by chapter_key so navigating between chapters resets state to a
 * sensible default (expanded, body collapsed) rather than showing the previous
 * chapter's collapsed state.
 */
export function ChapterIntroBanner({ config }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  // Reset to defaults whenever the chapter changes — the parent re-keys the
  // component but this is belt-and-suspenders if React reuses the instance.
  useEffect(() => {
    setCollapsed(false);
    setBodyExpanded(false);
  }, [config.chapterKey]);

  const bodyHtml = renderMiniMarkdown(config.bodyMd);
  // "Long" body gets the read-more affordance. ~280 chars is roughly two
  // lines of body copy at the banner width — anything beyond starts to
  // dominate the page above the step content.
  const isLongBody = config.bodyMd.length > 280;

  if (collapsed) {
    return (
      <div
        className="cine-intro-banner cine-intro-banner-collapsed"
        role="region"
        aria-label="Chapter overview"
      >
        <button
          type="button"
          className="cine-intro-banner-refresh"
          onClick={() => setCollapsed(false)}
          aria-expanded={false}
        >
          Need a refresher? <span aria-hidden="true">↓</span>
        </button>
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
            onClick={() => setCollapsed(true)}
            aria-expanded={true}
            aria-label="Collapse chapter overview"
            title="Collapse"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {bodyHtml && (
          <div
            className={`cine-intro-banner-prose${
              isLongBody && !bodyExpanded ? " is-clamped" : ""
            }`}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        )}

        {isLongBody && (
          <button
            type="button"
            className="cine-intro-banner-readmore"
            onClick={() => setBodyExpanded((v) => !v)}
            aria-expanded={bodyExpanded}
          >
            {bodyExpanded ? "Read less" : "Read more"}
          </button>
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
      </div>
    </div>
  );
}
