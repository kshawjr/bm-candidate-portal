import Image from "next/image";
import type { PhotoCardData } from "./types";

export function PhotoCard({ card }: { card: PhotoCardData }) {
  return (
    <article className="cc-card cc-photo">
      <div className="cc-photo-frame">
        <Image
          src={card.image_url}
          alt={card.caption ?? ""}
          width={1280}
          height={720}
          unoptimized
        />
      </div>
      {card.caption && <p className="cc-photo-caption">{card.caption}</p>}
    </article>
  );
}
