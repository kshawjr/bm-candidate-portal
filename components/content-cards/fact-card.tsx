import type { FactCardData } from "./types";

export function FactCard({ card }: { card: FactCardData }) {
  return (
    <article className="cc-card cc-fact">
      <h3 className="cc-fact-headline">{card.headline}</h3>
      <p className="cc-fact-body">{card.body}</p>
      {card.source && <p className="cc-fact-source">Source: {card.source}</p>}
    </article>
  );
}
