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

export function FactCard({ card }: { card: FactCardData }) {
  const parsed = parseFactStat(card.headline);

  if (parsed) {
    return (
      <article className="cc-card cc-fact cc-fact-split">
        <div className="cc-fact-stat-col">
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

  return (
    <article className="cc-card cc-fact">
      <h3 className="cc-fact-headline">{card.headline}</h3>
      <p className="cc-fact-body">{card.body}</p>
      {card.source && <p className="cc-fact-source">Source: {card.source}</p>}
    </article>
  );
}
