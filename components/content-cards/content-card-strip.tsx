import type { ContentCard } from "./types";
import { FactCard } from "./fact-card";
import { QuoteCard } from "./quote-card";
import { AwardsCard } from "./awards-card";
import { PersonasCard } from "./personas-card";
import { PhotoCard } from "./photo-card";
import { JourneyAheadCard } from "./journey-ahead-card";

interface Props {
  cards: ContentCard[];
  heading?: string;
  brandSlug: string;
  currentChapterKey: string | null;
}

export function ContentCardStrip({
  cards,
  heading = "Learn more",
  brandSlug,
  currentChapterKey,
}: Props) {
  if (!cards || cards.length === 0) return null;

  return (
    <section className="cc-strip">
      <div className="cc-strip-eyebrow">{heading}</div>
      <div className="cc-strip-stack">
        {cards.map((card, i) => {
          switch (card.type) {
            case "fact":
              return <FactCard key={i} card={card} />;
            case "quote":
              return <QuoteCard key={i} card={card} />;
            case "awards":
              return <AwardsCard key={i} card={card} />;
            case "personas":
              return <PersonasCard key={i} card={card} />;
            case "photo":
              return <PhotoCard key={i} card={card} />;
            case "journey_ahead":
              return (
                <JourneyAheadCard
                  key={i}
                  brandSlug={brandSlug}
                  currentChapterKey={currentChapterKey}
                />
              );
          }
        })}
      </div>
    </section>
  );
}
