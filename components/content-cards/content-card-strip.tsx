"use client";

import { useCandidateUnlocks } from "@/lib/hooks/use-candidate-unlocks";
import { getCardVisibility } from "@/lib/card-visibility";
import type { ContentCard } from "./types";
import { FactCard } from "./fact-card";
import { QuoteCard } from "./quote-card";
import { AwardsCard } from "./awards-card";
import { PersonasCard } from "./personas-card";
import { PhotoCard } from "./photo-card";
import { JourneyAheadCard } from "./journey-ahead-card";
import { LockedTeaserCard } from "./locked-teaser-card";

interface Props {
  cards: ContentCard[];
  heading?: string;
  brandSlug: string;
  currentChapterKey: string | null;
  /** bmave-core.candidates.id for the candidate viewing this strip.
   *  Drives the unlock-key gating via useCandidateUnlocks. Pass `null`
   *  in surfaces where there's no live candidate (admin preview). */
  candidateId: string | null;
  /** SSR snapshot of unlocked_keys. Seeds the hook so the first paint
   *  matches the candidate's actual unlock state. */
  initialUnlockedKeys?: string[];
}

export function ContentCardStrip({
  cards,
  heading = "Learn more",
  brandSlug,
  currentChapterKey,
  candidateId,
  initialUnlockedKeys = [],
}: Props) {
  // Single live source of unlock state — the hook also powers the
  // WaitingRenderer's parked → unlocked transition, so a page with both
  // a waiting step and gated cards uses one subscription channel name
  // (Supabase dedupes channel names within a client) instead of two
  // diverging code paths.
  const { unlocks } = useCandidateUnlocks(candidateId, initialUnlockedKeys);

  if (!cards || cards.length === 0) return null;

  // Resolve once so a card that drops to `hidden` doesn't leave an empty
  // strip frame. If every card is hidden, render nothing.
  const visibleEntries = cards
    .map((card, i) => ({ card, i, vis: getCardVisibility(card, unlocks) }))
    .filter((e) => e.vis.state !== "hidden");

  if (visibleEntries.length === 0) return null;

  return (
    <section className="cc-strip">
      <div className="cc-strip-eyebrow">{heading}</div>
      <div className="cc-strip-stack">
        {visibleEntries.map(({ card, i, vis }) => {
          if (vis.state === "locked_teaser") {
            return (
              <LockedTeaserCard key={i} teaserText={vis.teaser_text} />
            );
          }
          // state === "visible"
          switch (card.type) {
            case "fact":
              return <FactCard key={i} card={card} />;
            case "quote":
              return <QuoteCard key={i} card={card} />;
            case "awards":
              return <AwardsCard key={i} card={card} />;
            case "personas":
              return <PersonasCard key={i} card={card} />;
            case "photo":
              return <PhotoCard key={i} card={card} />;
            case "journey_ahead":
              return (
                <JourneyAheadCard
                  key={i}
                  card={card}
                  brandSlug={brandSlug}
                  currentChapterKey={currentChapterKey}
                />
              );
          }
        })}
      </div>
    </section>
  );
}
