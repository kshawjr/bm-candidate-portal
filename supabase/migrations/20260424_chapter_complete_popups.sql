-- PR 36: chapter complete popup.
--
-- Fires after a candidate finishes the last step of a chapter, BEFORE
-- current_chapter advances. Click-through dismissal then triggers the
-- advance via completeChapterAndAdvance — that's how Chapter N's celebration
-- gets to land before Chapter N+1's transition video / intro fire.
--
-- Mirrors the per-chapter pattern of chapter_videos + chapter_intro_popups:
--   - one row per (brand, chapter)
--   - is_active toggle for admin pause-without-delete
--   - per-candidate dismissals via dismissed_chapter_completes (added in
--     the companion migration 20260424_dismissed_chapter_completes.sql)

create table if not exists chapter_complete_popups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  chapter_key text not null,
  heading text not null,
  body_md text,
  cta_label text default 'Keep going',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, chapter_key)
);

create index if not exists chapter_complete_popups_brand_chapter_idx
  on chapter_complete_popups (brand_id, chapter_key);

-- Reuse the popup updated_at trigger function from PR 31. Re-define
-- defensively so this migration is safe to apply on a database missing it.
create or replace function set_popup_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists chapter_complete_popups_updated_at on chapter_complete_popups;
create trigger chapter_complete_popups_updated_at
  before update on chapter_complete_popups
  for each row execute function set_popup_updated_at();

alter table chapter_complete_popups enable row level security;
