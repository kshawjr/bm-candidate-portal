-- PR 33: candidate dismissals for per-step transition popups.
--
-- Mirrors the dismissed_chapter_intros pattern from PR 31. Append the
-- step_id (uuid string) when the candidate clicks dismiss; the popup is
-- gated on absence from this array. resetCandidateAction clears it so the
-- dev flow can re-watch transitions.

alter table candidates_in_portal
  add column if not exists dismissed_step_transitions jsonb not null default '[]'::jsonb;
