-- PR 34: chapter transition videos.
--
-- Generalizes the brand-level welcome popup (PR 31) into a per-chapter video
-- table. Each chapter can now have its own transition video (Chapter 1 gets
-- the migrated welcome video; Chapter 2+ start unconfigured).
--
-- Migration steps in order:
--   1. Create chapter_videos table
--   2. Copy welcome_popups rows into chapter_videos with chapter_key='explore'
--   3. Drop welcome_popups
--   4. Add dismissed_chapter_videos column to candidates_in_portal
--   5. Migrate has_seen_welcome=true candidates by appending 'explore' to
--      their dismissed_chapter_videos array
--   6. Keep has_seen_welcome column for now (deprecated, unused). Drop in a
--      later cleanup pass once we're confident nothing references it.

-- 1. New table -----------------------------------------------------------
create table if not exists chapter_videos (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  chapter_key text not null,
  title text,
  video_url text not null,
  video_provider text not null check (video_provider in ('youtube', 'vimeo', 'mp4')),
  description text,
  cta_dismiss_label text default 'Got it',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, chapter_key)
);

create index if not exists chapter_videos_brand_chapter_idx
  on chapter_videos (brand_id, chapter_key);

-- updated_at trigger. Reuses the popup trigger function from PR 31.
create or replace function set_popup_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chapter_videos_updated_at on chapter_videos;
create trigger chapter_videos_updated_at
  before update on chapter_videos
  for each row execute function set_popup_updated_at();

alter table chapter_videos enable row level security;

-- 2. Migrate welcome_popups → chapter_videos (Chapter 1 = 'explore') -----
-- Guarded by `if exists` so this migration is safe to re-run on a database
-- where welcome_popups was already dropped.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'welcome_popups'
  ) then
    insert into chapter_videos (
      brand_id, chapter_key, title, video_url, video_provider,
      description, cta_dismiss_label, is_active
    )
    select
      brand_id, 'explore', title, video_url, video_provider,
      description, cta_dismiss_label, is_active
    from welcome_popups
    on conflict (brand_id, chapter_key) do nothing;
  end if;
end $$;

-- 3. Drop the old table --------------------------------------------------
drop table if exists welcome_popups;

-- 4. Per-chapter dismissal column on candidates_in_portal ----------------
alter table candidates_in_portal
  add column if not exists dismissed_chapter_videos jsonb not null default '[]'::jsonb;

-- 5. Migrate has_seen_welcome → dismissed_chapter_videos -----------------
-- Anyone who'd seen the brand-level welcome should not re-see it as the
-- Chapter 1 transition video. Append 'explore' to their dismissal array.
update candidates_in_portal
set dismissed_chapter_videos = '["explore"]'::jsonb
where has_seen_welcome = true
  and not (dismissed_chapter_videos @> '["explore"]'::jsonb);
