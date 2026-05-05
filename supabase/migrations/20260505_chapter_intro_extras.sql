-- F2 follow-up: expose three pieces of the chapter intro popup that were
-- previously hardcoded in components/portal/chapter-intro-popup.tsx.
--
--   scarcity_framing : { heading, body } | null
--                      Heading + body of the "By invitation only" block.
--                      Renders only on first_chat (preserves the legacy
--                      visibility condition); content falls back to
--                      hardcoded copy in the renderer when null so brands
--                      that haven't been edited yet don't break.
--
--   slots_remaining  : { min, max } | null
--                      Range for the random "N more candidates" count.
--                      Replaces a hardcoded random(2..5). null = omit the
--                      count entirely. Existing first_chat rows seed to
--                      { min: 3, max: 8 } so the renderer keeps showing a
--                      number until admins decide otherwise.
--
--   continue_hint    : text | null
--                      Helper text shown when the pre-dismiss checklist
--                      isn't fully ticked. Falls back to the legacy
--                      "Check the items above to continue" copy.

alter table chapter_intro_popups
  add column if not exists scarcity_framing jsonb,
  add column if not exists slots_remaining jsonb,
  add column if not exists continue_hint text;

-- Seed first_chat rows so the slots count keeps appearing post-deploy.
update chapter_intro_popups
set slots_remaining = '{"min":3,"max":8}'::jsonb
where chapter_key = 'first_chat'
  and slots_remaining is null;
