import { JourneyTimeline } from "@/components/portal/journey-timeline";
import { resolveCardTitle, type JourneyAheadCardData } from "./types";

interface Props {
  card: JourneyAheadCardData;
  brandSlug: string;
  currentChapterKey: string | null;
}

// Wraps the existing 8-stage roadmap so it can sit in the content-card
// strip alongside other cards. Stage data and brand scenery come from
// props at render time; the only per-card editable surface is the title
// (defaults to "Your journey ahead"), forwarded into JourneyTimeline.
export function JourneyAheadCard({ card, brandSlug, currentChapterKey }: Props) {
  const title = resolveCardTitle(card);
  return (
    <JourneyTimeline
      brandSlug={brandSlug}
      currentChapterKey={currentChapterKey}
      title={title ?? undefined}
      backgroundImageUrl={card.background_image_url ?? null}
    />
  );
}
