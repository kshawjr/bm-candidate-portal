import { JourneyTimeline } from "@/components/portal/journey-timeline";

interface Props {
  brandSlug: string;
  currentChapterKey: string | null;
}

// Wraps the existing 8-stage roadmap so it can sit in the content-card
// strip alongside other cards. The data and scenery come from props, not
// from per-instance config — admins can only reorder this card, never
// edit its contents in the admin UI.
export function JourneyAheadCard({ brandSlug, currentChapterKey }: Props) {
  return (
    <JourneyTimeline brandSlug={brandSlug} currentChapterKey={currentChapterKey} />
  );
}
