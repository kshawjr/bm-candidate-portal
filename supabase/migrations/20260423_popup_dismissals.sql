-- PR 31: track which onboarding popups a candidate has dismissed.
--
-- has_seen_welcome:        flipped to true when the candidate dismisses the
--                          one-time welcome popup. Once true, the welcome
--                          popup never shows again unless the candidate is
--                          reset.
-- dismissed_chapter_intros: array of chapter_keys whose intro popup the
--                          candidate has already dismissed. Each chapter's
--                          intro shows at most once per candidate.
--
-- Both are populated only by the dismiss server actions in
-- app/portal/[token]/popup-actions.ts and cleared by resetCandidateAction.

alter table candidates_in_portal
  add column if not exists has_seen_welcome boolean not null default false,
  add column if not exists dismissed_chapter_intros jsonb not null default '[]'::jsonb;
