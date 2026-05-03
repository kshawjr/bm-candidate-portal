-- PR 33: per-step transition popups.
--
-- A small toast-like popup that fires when a candidate moves between steps
-- inside a chapter ("Great, now the application →"). step_id references the
-- step the candidate is ABOUT TO ENTER. Stored as a plain uuid (no
-- DB-enforced FK; same cross-table pattern as chapter_intro_popups against
-- chapters_config).
--
-- Idempotency / dedupe: per-candidate dismissal lives in
-- candidates_in_portal.dismissed_step_transitions (jsonb array of step_ids).
-- See the companion migration 20260424_dismissed_step_transitions.sql.

create table if not exists step_transition_popups (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null,
  step_id uuid not null,
  heading text not null,
  body_md text,
  cta_label text default 'Continue',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, step_id)
);

create index if not exists step_transition_popups_brand_step_idx
  on step_transition_popups (brand_id, step_id);

-- Reuse the popup updated_at trigger function created in PR 31 if present;
-- otherwise create it. Idempotent across migrations.
create or replace function set_popup_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists step_transition_popups_updated_at on step_transition_popups;
create trigger step_transition_popups_updated_at
  before update on step_transition_popups
  for each row execute function set_popup_updated_at();

alter table step_transition_popups enable row level security;
