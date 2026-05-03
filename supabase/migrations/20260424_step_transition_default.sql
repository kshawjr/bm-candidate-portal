-- PR 39: per-step toggle for the new auto-on transition popups.
--
-- Step transitions used to be opt-in: only steps with a row in
-- step_transition_popups would fire a toast. PR 39 inverts that — every step
-- gets an auto-generated transition by default ("Next: <step label>"). Admins
-- can flip is_step_transition_enabled = false on a per-step basis when the
-- transition would feel redundant (e.g., a single-step chapter where the
-- chapter video already covers the gear-shift).

alter table steps_config
  add column if not exists is_step_transition_enabled boolean not null default true;
