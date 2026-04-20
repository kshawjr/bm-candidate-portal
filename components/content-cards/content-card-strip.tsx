import type { ContentCard } from "./types";
import { FactCard } from "./fact-card";
import { QuoteCard } from "./quote-card";
import { AwardsCard } from "./awards-card";
import { PersonasCard } from "./personas-card";
import { PhotoCard } from "./photo-card";

interface Props {
  cards: ContentCard[];
  heading?: string;
}

export function ContentCardStrip({ cards, heading = "Learn more" }: Props) {
  if (!cards || cards.length === 0) return null;

  return (
    <section className="cc-strip">
      <div className="cc-strip-eyebrow">{heading}</div>
      <div className="cc-strip-grid">
        {cards.map((card, i) => {
          // Photo cards span the full strip for visual weight; other cards
          // share the grid in the default column flow.
          const spanFull = card.type === "photo";
          return (
            <div
              key={i}
              className={`cc-strip-cell${spanFull ? " cc-strip-cell-full" : ""}`}
            >
              {card.type === "fact" && <FactCard card={card} />}
              {card.type === "quote" && <QuoteCard card={card} />}
              {card.type === "awards" && <AwardsCard card={card} />}
              {card.type === "personas" && <PersonasCard card={card} />}
              {card.type === "photo" && <PhotoCard card={card} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
