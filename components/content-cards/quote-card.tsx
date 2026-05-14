import Image from "next/image";
import { resolveCardTitle, type QuoteCardData } from "./types";

// http(s) URLs open in a new tab; mailto: / tel: stay in-place so the
// browser hands off to the mail / phone app natively (opening those in
// a new tab leaves an empty tab behind).
function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function QuoteCard({ card }: { card: QuoteCardData }) {
  const initial = (card.author.trim().charAt(0) || "?").toUpperCase();
  const title = resolveCardTitle(card);
  // Defensive: only render the link when BOTH fields are set. One
  // without the other is admin error rather than intent, so we
  // suppress rather than render something half-broken.
  const linkUrl = card.link_url?.trim();
  const linkLabel = card.link_label?.trim();
  const showLink = !!linkUrl && !!linkLabel;

  return (
    <article className="cc-card cc-quote">
      {title && <div className="cc-card-section-label">{title}</div>}
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
          {showLink && (
            <a
              href={linkUrl}
              className="cc-quote-link"
              target={isExternalUrl(linkUrl!) ? "_blank" : undefined}
              rel={isExternalUrl(linkUrl!) ? "noopener noreferrer" : undefined}
            >
              {linkLabel}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
