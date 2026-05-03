-- PR 40: pre-dismiss checklist on chapter intro popups.
--
-- Some chapter intros (notably Chapter 2's Discovery Call prep) want to
-- gate the dismiss CTA behind a few "I commit to this" affirmations:
-- being on a real video call, having the slide deck visible, partner
-- present, etc. The checklist is per-popup configurable so admins can
-- decide which chapters need this kind of moment.
--
-- jsonb shape:
--   { "heading": "Before you book — quick check",
--     "items":   ["...", "...", "..."] }
-- null = no checklist; popup CTA enables immediately as before.

alter table chapter_intro_popups
  add column if not exists pre_dismiss_checklist jsonb;
