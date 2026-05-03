"use client";

import { useState } from "react";
import {
  ChapterVideoPopup,
  type ChapterVideoConfig,
} from "@/components/portal/chapter-video-popup";
import {
  ChapterIntroPopup,
  type ChapterIntroPopupConfig,
} from "@/components/portal/chapter-intro-popup";
import {
  ChapterCompletePopup,
  type ChapterCompletePopupConfig,
} from "@/components/portal/chapter-complete-popup";

interface Props {
  /** Chapter complete popup, fires when the candidate has finished the
   *  last step of their CURRENT chapter but hasn't yet been advanced past
   *  it. Dismissal triggers the advance. Always wins priority over the
   *  next chapter's video/intro since it belongs to the chapter just
   *  finished. */
  chapterComplete: ChapterCompletePopupConfig | null;
  /** Per-chapter transition video. Null when nothing is configured for the
   *  current chapter, the row is inactive, or the candidate has already
   *  dismissed it. */
  chapterVideo: ChapterVideoConfig | null;
  /** Chapter intro popup to show. Null when nothing is configured for the
   *  current chapter or the candidate has already dismissed it. */
  chapterIntro: ChapterIntroPopupConfig | null;
  onDismissChapterComplete: (
    chapterKey: string,
  ) => Promise<{ success: boolean }>;
  onDismissChapterVideo: (
    chapterKey: string,
  ) => Promise<{ success: boolean }>;
  onDismissChapterIntro: (chapterKey: string) => Promise<{ success: boolean }>;
}

/**
 * Per-chapter onboarding sequencer:
 *   1. Chapter complete popup (if pending) — finishes the OLD chapter.
 *      Dismissing this triggers the server-side current_chapter advance.
 *   2. Chapter video shows next if pending.
 *   3. Chapter intro popup waits for video to dismiss.
 *   4. All can be null — in which case nothing renders and the chapter
 *      content (plus banner, if configured) shows immediately.
 *
 * The local *Dismissed flags scope to ONE chapter: once dismissed within
 * a chapter, the same popup doesn't flash back in during the brief window
 * between server action and revalidation.
 *
 * Resetting between chapters is handled by the parent: the page passes
 * `key={currentChapterKey}` so React remounts this component when the
 * candidate's current_chapter advances. That wipes the local flags so
 * the next chapter's video + intro fire on a clean slate. Don't read
 * these flags as "session-wide" — they're per-chapter by mount.
 */
export function OnboardingPopups({
  chapterComplete,
  chapterVideo,
  chapterIntro,
  onDismissChapterComplete,
  onDismissChapterVideo,
  onDismissChapterIntro,
}: Props) {
  const [completeDismissed, setCompleteDismissed] = useState(false);
  const [videoDismissed, setVideoDismissed] = useState(false);
  const [chapterDismissed, setChapterDismissed] = useState(false);

  const showComplete = chapterComplete !== null && !completeDismissed;
  const showVideo =
    !showComplete && chapterVideo !== null && !videoDismissed;
  const showChapter =
    !showComplete &&
    chapterIntro !== null &&
    !chapterDismissed &&
    (chapterVideo === null || videoDismissed);

  if (showComplete && chapterComplete) {
    return (
      <ChapterCompletePopup
        config={chapterComplete}
        onDismiss={onDismissChapterComplete}
        onDismissed={() => setCompleteDismissed(true)}
      />
    );
  }

  if (showVideo && chapterVideo) {
    return (
      <ChapterVideoPopup
        config={chapterVideo}
        onDismiss={onDismissChapterVideo}
        onDismissed={() => setVideoDismissed(true)}
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
