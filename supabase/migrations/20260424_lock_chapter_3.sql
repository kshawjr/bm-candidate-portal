-- PR 44: lock Chapter 3 (deep_dive) to a "no active steps" state for
-- existing brands. The portal renders a YoureCurrentScreen landing card
-- whenever the candidate's current chapter has zero active steps; that
-- state IS the lock. Chapter 3's content isn't built yet — auto-
-- advancing here from Chapter 2's booking should land on the holding
-- screen, not on stale demo steps from PR 16.
--
-- We archive (not delete) the existing seeded steps so the audit trail
-- survives. Admins can unarchive via /admin/structure when Chapter 3 is
-- ready to ship.
--
-- The companion seed change drops 'deep_dive' from CHAPTER_STEPS so
-- fresh brands never seed those steps in the first place.

update steps_config
   set is_archived = true
 where chapter_key = 'deep_dive'
   and is_archived = false;
