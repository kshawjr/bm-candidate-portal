"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { resolveCardTitle, type VideoCardData } from "./types";

// http(s) URLs open in a new tab; other schemes stay in-place so the
// browser can hand off to a native app if any admin ever paints one in.
function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// Card videos always autoplay muted; native <video controls> render only
// when has_sound=true so the candidate can unmute. Deliberately no
// overlay "Tap for sound" pill — that's the slide-deck treatment
// (full-bleed, one video per screen). Cards flow inline in the page and
// benefit more from standard browser controls.
//
// prefers-reduced-motion: skip autoplay, but still show controls so
// motion-sensitive candidates can opt into playback (matches SlideVideo's
// posture).
//
// PR 132 / 134 background: iOS Safari can silently reject the `autoPlay`
// attribute (off-viewport mount, low-power mode, hydration races) with no
// recovery path — candidate sees an empty rectangle. Programmatic
// .play() is more permissible for muted videos; .catch() handles the
// remaining edge case so a blocked autoplay just leaves the video paused
// instead of throwing.
export function VideoCard({ card }: { card: VideoCardData }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();
  const title = resolveCardTitle(card);
  const shouldAutoplay = !reduceMotion;
  const linkUrl = card.link_url?.trim();
  const linkLabel = card.link_label?.trim() || "Learn more";
  const showLink = !!linkUrl;

  useEffect(() => {
    if (!shouldAutoplay) return;
    const v = videoRef.current;
    if (!v) return;
    v.play().catch((err) => {
      console.warn("[VideoCard] autoplay blocked:", err);
    });
  }, [shouldAutoplay, card.video_url]);

  return (
    <article className="cc-card cc-video">
      {title && <div className="cc-card-section-label">{title}</div>}
      <div className="cc-video-frame">
        <video
          ref={videoRef}
          src={card.video_url}
          playsInline
          preload="metadata"
          muted
          controls={card.has_sound}
          width={1280}
          height={720}
        />
      </div>
      {card.caption && <p className="cc-video-caption">{card.caption}</p>}
      {showLink && (
        <a
          href={linkUrl}
          className="cc-video-link"
          target={isExternalUrl(linkUrl!) ? "_blank" : undefined}
          rel={isExternalUrl(linkUrl!) ? "noopener noreferrer" : undefined}
        >
          {linkLabel}
        </a>
      )}
    </article>
  );
}
