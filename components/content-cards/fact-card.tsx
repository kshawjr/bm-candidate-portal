import Image from "next/image";
import type { FactCardData } from "./types";

// Heuristic: if the headline begins with a clear stat token (digits, $, %, K/M/B
// suffix, + sign, commas), split it into a big display stat and a supporting
// label. Otherwise render a single-column headline + body.
function parseFactStat(
  headline: string,
): { stat: string; label: string } | null {
  const match = headline.match(/^([$\d][\d.,]*(?:[KMB])?[%+]?)\s+(.+)$/i);
  if (!match) return null;
  const stat = match[1];
  const label = match[2];
  if (stat.length > 10) return null;
  return { stat, label };
}

function FactImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="cc-fact-image">
      <Image
        src={src}
        alt={alt}
        width={600}
        height={450}
        unoptimized
      />
    </div>
  );
}

export function FactCard({ card }: { card: FactCardData }) {
  const parsed = parseFactStat(card.headline);
  const hasImage = Boolean(card.image_url);

  // Case 1: stat parse succeeded → keep the 2-col (stat | body) layout.
  //   With image: stack image ABOVE the stat in the left column so the
  //   visual ties to the number. Keeps the chassis symmetrical.
  //   Without image: layout unchanged from pre-image version.
  if (parsed) {
    return (
      <article className="cc-card cc-fact cc-fact-split">
        <div className="cc-fact-stat-col">
          {hasImage && <FactImage src={card.image_url!} alt={card.headline} />}
          <div className="cc-fact-stat">{parsed.stat}</div>
          <div className="cc-fact-stat-label">{parsed.label}</div>
        </div>
        <div className="cc-fact-body-col">
          <p className="cc-fact-body">{card.body}</p>
          {card.source && (
            <p className="cc-fact-source">Source: {card.source}</p>
          )}
        </div>
      </article>
    );
  }

  // Case 2: qualitative fact (no detectable stat).
  //   With image: image banners the top, headline + body flow below.
  //   Without image: plain single-column headline + body (pre-image fallback).
  return (
    <article
      className={`cc-card cc-fact${hasImage ? " cc-fact-banner" : ""}`}
    >
      {hasImage && <FactImage src={card.image_url!} alt={card.headline} />}
      <h3 className="cc-fact-headline">{card.headline}</h3>
      <p className="cc-fact-body">{card.body}</p>
      {card.source && <p className="cc-fact-source">Source: {card.source}</p>}
    </article>
  );
}
