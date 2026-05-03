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

interface Props {
  /** Per-chapter transition video. Null when nothing is configured for the
   *  current chapter, the row is inactive, or the candidate has already
   *  dismissed it. */
  chapterVideo: ChapterVideoConfig | null;
  /** Chapter intro popup to show. Null when nothing is configured for the
   *  current chapter or the candidate has already dismissed it. */
  chapterIntro: ChapterIntroPopupConfig | null;
  onDismissChapterVideo: (
    chapterKey: string,
  ) => Promise<{ success: boolean }>;
  onDismissChapterIntro: (chapterKey: string) => Promise<{ success: boolean }>;
}

/**
 * Per-chapter onboarding sequencer:
 *   1. Chapter video shows first if pending.
 *   2. Chapter intro popup waits for video to dismiss.
 *   3. Both can be null — in which case nothing renders and the chapter
 *      content (plus banner, if configured) shows immediately.
 *
 * The local videoDismissed / chapterDismissed flags scope to ONE chapter:
 * once dismissed within a chapter, the same popup doesn't flash back in
 * during the brief window between server action and revalidation.
 *
 * Resetting between chapters is handled by the parent: the page passes
 * `key={currentChapterKey}` so React remounts this component when the
 * candidate's current_chapter advances. That wipes the local flags so the
 * next chapter's video + intro fire on a clean slate. Don't read these
 * flags as "session-wide" — they're per-chapter by mount.
 */
export function OnboardingPopups({
  chapterVideo,
  chapterIntro,
  onDismissChapterVideo,
  onDismissChapterIntro,
}: Props) {
  const [videoDismissed, setVideoDismissed] = useState(false);
  const [chapterDismissed, setChapterDismissed] = useState(false);

  const showVideo = chapterVideo !== null && !videoDismissed;
  const showChapter =
    chapterIntro !== null &&
    !chapterDismissed &&
    // Wait for the video — if a video is pending for this chapter, the
    // intro popup stays back until it's gone.
    (chapterVideo === null || videoDismissed);

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
