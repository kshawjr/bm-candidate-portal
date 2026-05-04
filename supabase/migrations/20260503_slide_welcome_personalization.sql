-- PR 59: personalize the welcome heading on slide 1.
--
-- PR 58 shipped a static "Welcome to Hounds Town" / "Welcome to
-- Cruisin' Tikis" heading on slide 0 of explore/tour. This migration
-- swaps in the {{first_name_greeting}} template variable so the
-- heading reads "Hi Jane, Welcome to Hounds Town" when the candidate
-- has a first_name on file, and "Welcome to Hounds Town" when they
-- don't (the greeting prefix collapses to an empty string in that
-- case — see lib/applySlideTemplate).
--
-- The bare {{first_name}} variable would also work but produces an
-- awkward "Welcome, there, to Hounds Town" fallback when the name
-- isn't known; the prefix-style template avoids that case entirely.
--
-- Run against the **bm-candidate-portal** Supabase project. Brand
-- IDs are the canonical bmave-core.brands ids.

update steps_config
set config = jsonb_set(
  config,
  '{slides,0,heading}',
  '"{{first_name_greeting}}Welcome to Hounds Town"'::jsonb,
  true
)
where brand_id = 'feb1fc5a-6839-41c0-8d3d-7f3deb0a1b83'
  and chapter_key = 'explore'
  and step_key = 'tour';

update steps_config
set config = jsonb_set(
  config,
  '{slides,0,heading}',
  '"{{first_name_greeting}}Welcome to Cruisin'' Tikis"'::jsonb,
  true
)
where brand_id = 'af772a65-c5f4-4a6c-a140-e1ecb715b2ae'
  and chapter_key = 'explore'
  and step_key = 'tour';
