import Image from "next/image";
import type { AwardsCardData } from "./types";

export function AwardsCard({ card }: { card: AwardsCardData }) {
  return (
    <article className="cc-card cc-awards">
      <div className="cc-awards-eyebrow">Recognition</div>
      <ul className="cc-awards-list">
        {card.items.map((item, i) => (
          <li key={i} className="cc-awards-item">
            {item.logo_url ? (
              <Image
                className="cc-awards-logo"
                src={item.logo_url}
                alt={item.name}
                width={240}
                height={120}
                unoptimized
              />
            ) : (
              <div className="cc-awards-logo-placeholder">🏆</div>
            )}
            <span className="cc-awards-name">{item.name}</span>
            {item.year && <span className="cc-awards-year">{item.year}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}
