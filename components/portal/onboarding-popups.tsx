"use client";

import { useState } from "react";
import {
  WelcomePopup,
  type WelcomePopupConfig,
} from "@/components/portal/welcome-popup";
import {
  ChapterIntroPopup,
  type ChapterIntroPopupConfig,
} from "@/components/portal/chapter-intro-popup";

interface Props {
  /** Welcome popup to show. Null when nothing is configured for the brand
   *  or the candidate has already dismissed it. */
  welcome: WelcomePopupConfig | null;
  /** Chapter intro popup to show. Null when nothing is configured for the
   *  current chapter or the candidate has already dismissed it. */
  chapterIntro: ChapterIntroPopupConfig | null;
  onDismissWelcome: () => Promise<{ success: boolean }>;
  onDismissChapterIntro: (chapterKey: string) => Promise<{ success: boolean }>;
}

/**
 * Sequencing rules:
 *   1. Welcome shows first if pending.
 *   2. Chapter intro waits until welcome dismisses.
 *   3. Both can be null — in which case nothing renders.
 *
 * Once a popup dismisses successfully it never re-mounts in this client
 * session — the server has flipped the corresponding flag, but until the
 * router refreshes the page our local state is the source of truth so the
 * popup doesn't flash back in for a frame.
 */
export function OnboardingPopups({
  welcome,
  chapterIntro,
  onDismissWelcome,
  onDismissChapterIntro,
}: Props) {
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [chapterDismissed, setChapterDismissed] = useState(false);

  const showWelcome = welcome !== null && !welcomeDismissed;
  const showChapter =
    chapterIntro !== null &&
    !chapterDismissed &&
    // Wait for welcome — if there's a pending welcome popup, the chapter
    // intro stays back until it's gone.
    (welcome === null || welcomeDismissed);

  if (showWelcome && welcome) {
    return (
      <WelcomePopup
        config={welcome}
        onDismiss={onDismissWelcome}
        onDismissed={() => setWelcomeDismissed(true)}
      />
    );
  }

  if (showChapter && chapterIntro) {
    return (
      <ChapterIntroPopup
        config={chapterIntro}
        onDismiss={onDismissChapterIntro}
        onDismissed={() => setChapterDismissed(true)}
      />
    );
  }

  return null;
}
