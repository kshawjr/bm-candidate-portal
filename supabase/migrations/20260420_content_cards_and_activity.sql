-- PR 8: content_cards on steps_config + last_activity_at on candidates_in_portal
--
-- Run manually against the bm-candidate-portal Supabase project
-- (Project > SQL Editor) before merging / re-seeding.

alter table steps_config
  add column if not exists content_cards jsonb not null default '[]'::jsonb;

alter table candidates_in_portal
  add column if not exists last_activity_at timestamptz not null default now();

-- last_activity_at is bumped in application code (server actions) on every
-- step completion and application-answer save. Existing rows get now() as
-- their initial value via the default.
