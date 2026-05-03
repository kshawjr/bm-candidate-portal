-- PR 31: admin-configured onboarding popups.
--
-- Both tables live in the candidate portal's own Supabase project and reference
-- bmave-core.brands(id) as a plain uuid (no DB-enforced FK; cross-project FKs
-- aren't supported, same pattern used by chapters_config + steps_config).
--
-- welcome_popups        — one row per brand. The first-load welcome video the
--                         candidate sees at most once. Unique on brand_id.
-- chapter_intro_popups  — one row per (brand, chapter_key). Shown the first
--                         time the candidate reaches that chapter.

create table if not exists welcome_popups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  title text,
  video_url text not null,
  video_provider text not null check (video_provider in ('youtube', 'vimeo', 'mp4')),
  description text,
  cta_dismiss_label text default 'Got it',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create index if not exists welcome_popups_brand_idx on welcome_popups (brand_id);

create table if not exists chapter_intro_popups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  chapter_key text not null,
  heading text not null,
  body_md text not null,
  hero_image_url text,
  bullets jsonb not null default '[]'::jsonb,
  cta_dismiss_label text default 'Let''s go',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, chapter_key)
);

create index if not exists chapter_intro_popups_brand_chapter_idx
  on chapter_intro_popups (brand_id, chapter_key);

-- updated_at auto-bump on update. Mirrors the trigger pattern used in
-- bmave-core for portal_content.
create or replace function set_popup_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists welcome_popups_updated_at on welcome_popups;
create trigger welcome_popups_updated_at
  before update on welcome_popups
  for each row execute function set_popup_updated_at();

drop trigger if exists chapter_intro_popups_updated_at on chapter_intro_popups;
create trigger chapter_intro_popups_updated_at
  before update on chapter_intro_popups
  for each row execute function set_popup_updated_at();

alter table welcome_popups enable row level security;
alter table chapter_intro_popups enable row level security;
