-- PR 127: chapter videos has_sound admin field.
--
-- Closes the data-layer gap from PR 125 (unified video playback).
-- PR 125 wired the has_sound prop end-to-end in ChapterVideoPopup but
-- left chapter_videos without the column the admin needs to populate
-- it. Every existing row reads as null, which the unified rule treats
-- as ambient (autoplay muted). After this column lands + the admin
-- editor exposes the radio, admins can opt individual chapter videos
-- into "paused with controls, candidate taps play with sound."
--
-- Run against the **bm-candidate-portal** Supabase project before
-- merging the code change that selects this column.
--
-- Tri-state on purpose:
--   true   → paused with controls, candidate taps play (with sound)
--   false  → autoplay muted, no controls (explicit ambient)
--   null   → use default (treated as ambient by the unified rule;
--            matches existing-row behavior — no backfill needed)
--
-- Default null preserves every existing row's current behavior: the
-- video continues to render as ambient autoplay muted until an admin
-- explicitly flips it to has_sound = true.

alter table chapter_videos
  add column if not exists has_sound boolean;
