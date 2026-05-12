import { JourneyTimeline } from "@/components/portal/journey-timeline";
import { resolveCardTitle, type JourneyAheadCardData } from "./types";

interface Props {
  card: JourneyAheadCardData;
  brandSlug: string;
  currentChapterKey: string | null;
}

// Wraps the 8-stage roadmap so it can sit in the content-card strip
// alongside other cards. Editable per-card: title, caption, background
// image, per-stop title + caption. Structural pieces (which chapter
// each stop maps to, when "You are here" lights up, brand scenery)
// stay hardcoded in JourneyTimeline.
export function JourneyAheadCard({ card, brandSlug, currentChapterKey }: Props) {
  const title = resolveCardTitle(card);
  return (
    <JourneyTimeline
      brandSlug={brandSlug}
      currentChapterKey={currentChapterKey}
      title={title ?? undefined}
      caption={card.caption ?? null}
      backgroundImageUrl={card.background_image_url ?? null}
      backgroundImageOpacity={card.background_image_opacity ?? null}
      stops={card.stops ?? null}
    />
  );
}
