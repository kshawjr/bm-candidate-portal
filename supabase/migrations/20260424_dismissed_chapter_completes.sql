-- PR 36: per-candidate dismissals for chapter complete popups.
--
-- Mirrors dismissed_chapter_videos / dismissed_chapter_intros from earlier
-- PRs. Append the chapter_key when the candidate clicks "Keep going" on
-- the popup; the popup is gated on absence from this array.
-- resetCandidateAction clears it so the dev flow can re-watch celebrations.

alter table candidates_in_portal
  add column if not exists dismissed_chapter_completes jsonb not null default '[]'::jsonb;
