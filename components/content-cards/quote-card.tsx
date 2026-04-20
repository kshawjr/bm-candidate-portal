import Image from "next/image";
import type { QuoteCardData } from "./types";

export function QuoteCard({ card }: { card: QuoteCardData }) {
  return (
    <article className="cc-card cc-quote">
      <blockquote className="cc-quote-body">&ldquo;{card.body}&rdquo;</blockquote>
      <div className="cc-quote-attribution">
        {card.photo_url && (
          <Image
            src={card.photo_url}
            alt={card.author}
            width={40}
            height={40}
            className="cc-quote-photo"
            unoptimized
          />
        )}
        <div className="cc-quote-identity">
          <div className="cc-quote-author">{card.author}</div>
          <div className="cc-quote-role">{card.role}</div>
        </div>
      </div>
    </article>
  );
}
