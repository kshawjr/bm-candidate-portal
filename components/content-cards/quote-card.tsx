import Image from "next/image";
import type { QuoteCardData } from "./types";

export function QuoteCard({ card }: { card: QuoteCardData }) {
  const initial = (card.author.trim().charAt(0) || "?").toUpperCase();

  return (
    <article className="cc-card cc-quote">
      <div className="cc-quote-mark" aria-hidden="true">
        {"\u201C"}
      </div>
      <blockquote className="cc-quote-body">{card.body}</blockquote>
      <div className="cc-quote-attribution">
        {card.photo_url ? (
          <Image
            className="cc-quote-photo"
            src={card.photo_url}
            alt={card.author}
            width={96}
            height={96}
            unoptimized
          />
        ) : (
          <div className="cc-quote-avatar-placeholder" aria-hidden="true">
            {initial}
          </div>
        )}
        <div className="cc-quote-identity">
          <div className="cc-quote-author">{card.author}</div>
          <div className="cc-quote-role">{card.role}</div>
        </div>
      </div>
    </article>
  );
}
