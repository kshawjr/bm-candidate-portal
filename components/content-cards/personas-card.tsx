import Image from "next/image";
import type { PersonasCardData } from "./types";

function PersonIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export function PersonasCard({ card }: { card: PersonasCardData }) {
  return (
    <article className="cc-card cc-personas">
      <div className="cc-card-section-label">Who they serve</div>
      <div className="cc-personas-grid">
        {card.items.map((p, i) => (
          <div key={i} className="cc-persona">
            <div className="cc-persona-photo">
              {p.photo_url ? (
                <Image
                  src={p.photo_url}
                  alt={p.name}
                  width={240}
                  height={240}
                  unoptimized
                />
              ) : (
                <div className="cc-persona-placeholder">
                  <PersonIcon />
                </div>
              )}
            </div>
            <div className="cc-persona-name">{p.name}</div>
            {p.caption && <div className="cc-persona-caption">{p.caption}</div>}
          </div>
        ))}
      </div>
    </article>
  );
}
