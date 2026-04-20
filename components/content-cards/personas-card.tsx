import Image from "next/image";
import type { PersonasCardData } from "./types";

export function PersonasCard({ card }: { card: PersonasCardData }) {
  return (
    <article className="cc-card cc-personas">
      <div className="cc-personas-eyebrow">Who they serve</div>
      <div className="cc-personas-grid">
        {card.items.map((p, i) => (
          <div key={i} className="cc-persona">
            {p.photo_url && (
              <div className="cc-persona-photo">
                <Image
                  src={p.photo_url}
                  alt={p.name}
                  width={200}
                  height={200}
                  unoptimized
                />
              </div>
            )}
            <div className="cc-persona-name">{p.name}</div>
            {p.caption && <div className="cc-persona-caption">{p.caption}</div>}
          </div>
        ))}
      </div>
    </article>
  );
}
