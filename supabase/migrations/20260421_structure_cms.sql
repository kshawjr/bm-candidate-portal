-- PR 15: structure CMS — admin-managed stops + steps
--
-- Adds archive capability (soft-delete) and a free-text description field
-- to both stops_config and steps_config. The admin UI can now manage the
-- full journey structure; the portal filters out archived rows so in-flight
-- candidates keep rendering cleanly while admins tidy things up.
--
-- Run manually against the bm-candidate-portal Supabase project
-- (Project > SQL Editor) before merging / re-seeding.

alter table stops_config
  add column if not exists is_archived boolean not null default false;

alter table stops_config
  add column if not exists description text;

alter table steps_config
  add column if not exists is_archived boolean not null default false;

alter table steps_config
  add column if not exists description text;

-- `description` on stops_config is brand-new. On steps_config it already
-- existed as nullable text in the original schema, so `add if not exists`
-- is a no-op there. Adding the alter unconditionally keeps the migration
-- self-consistent across environments that may have drifted.
