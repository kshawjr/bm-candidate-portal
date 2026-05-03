-- PR 38: collapse Chapter 2 — drop the call_prep step entirely.
--
-- Chapter 2 currently has [call_prep, schedule]. The call_prep page's
-- preparation content (what we'll cover, come prepared, partner callout)
-- moves into Chapter 2's intro popup + banner so the candidate gets the
-- same context without an extra step. Schedule becomes the only step.
--
-- Cleanup order:
--   1. Drop any step_transition_popup rows pointing at a call_prep step,
--      so we don't leave orphaned popup config behind.
--   2. Delete every call_prep step (any chapter, any brand — call_prep
--      is being removed from the content type registry too, so no row
--      should be allowed to keep that type).
--   3. Renormalise positions in Chapter 2 (first_chat) so the surviving
--      schedule step sits at position 0.

-- Step transition popups for either call_prep OR Chapter 2's old "hello"
-- video step (PR 38 collapses Chapter 2 to schedule-only).
delete from step_transition_popups
where step_id in (
  select id from steps_config
  where content_type = 'call_prep'
     or (chapter_key = 'first_chat' and step_key = 'hello')
);

delete from steps_config where content_type = 'call_prep';

-- PR 38 also drops the Chapter 2 "Quick hello" video step. The transition
-- video popup (PR 34) covers the same beat now, and the spec makes Chapter
-- 2 a single-step chapter (just the schedule grid).
delete from steps_config
where chapter_key = 'first_chat' and step_key = 'hello';

-- Renumber Chapter 2 steps from 0. Two-phase to avoid any (brand_id,
-- chapter_key, position) unique-constraint trip if one is added later.
update steps_config
set position = position + 1000
where chapter_key = 'first_chat';

with ordered as (
  select id, row_number() over (
    partition by brand_id
    order by position
  ) - 1 as new_pos
  from steps_config
  where chapter_key = 'first_chat'
)
update steps_config
set position = ordered.new_pos
from ordered
where steps_config.id = ordered.id;
