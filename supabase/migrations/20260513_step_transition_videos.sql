-- Step-level transition videos. Mirrors chapter_videos (PR 34) but keyed
-- to a specific step within a chapter rather than the chapter as a whole.
-- A step transition video plays the first time a candidate advances past
-- the step the video is attached to; it sequences before any matching
-- step_transition_popups row so admins can stack a video + popup.
--
-- MP4-only. Step transitions are smaller-scale than chapter transitions,
-- so we skipped video_provider / description / cta_dismiss_label here —
-- the renderer always uses a "Continue" button after playback.
--
-- (brand_id, step_id) unique mirrors step_transition_popups so per-brand
-- editing semantics are identical.

create table if not exists step_transition_videos (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null,
  step_id         uuid not null,
  video_url       text not null,
  poster_url      text,
  has_sound       boolean,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (brand_id, step_id)
);

create index if not exists step_transition_videos_brand_step_idx
  on step_transition_videos (brand_id, step_id);

-- Per-candidate dismissal tracking. Same shape as
-- dismissed_step_transitions (popups) — JSONB array of step_ids the
-- candidate has already watched. The renderer reads from this array to
-- decide whether to fire the video on subsequent visits.
alter table candidates_in_portal
  add column if not exists dismissed_step_transition_videos jsonb
  not null default '[]'::jsonb;
