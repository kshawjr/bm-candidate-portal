import Image from "next/image";
import type { AwardsCardData } from "./types";

function StarIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function AwardsCard({ card }: { card: AwardsCardData }) {
  return (
    <article className="cc-card cc-awards">
      <div className="cc-card-section-label">Recognition</div>
      <ul className="cc-awards-row">
        {card.items.map((item, i) => (
          <li key={i} className="cc-award-tile">
            <div className="cc-award-logo-slot">
              {item.logo_url ? (
                <Image
                  className="cc-award-logo-img"
                  src={item.logo_url}
                  alt={item.name}
                  width={240}
                  height={140}
                  unoptimized
                />
              ) : (
                <div className="cc-award-placeholder">
                  <StarIcon />
                </div>
              )}
            </div>
            <div className="cc-award-name">{item.name}</div>
            {item.year && <div className="cc-award-year">{item.year}</div>}
          </li>
        ))}
      </ul>
    </article>
  );
}
