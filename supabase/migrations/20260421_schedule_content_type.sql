-- PR 16: schedule content type — bookings table
--
-- Run manually against the bm-candidate-portal Supabase project
-- (Project > SQL Editor) before merging / re-seeding.
--
-- NOTE: there is a SECOND migration file that runs against bmave-core:
--   supabase/migrations/20260421_schedule_content_type_bmave_core.sql
-- It adds the `advisor_calendar_email` column to `brands`. Run both.

create table if not exists public.bookings (
  id                      uuid primary key default gen_random_uuid(),
  candidate_in_portal_id  uuid not null references public.candidates_in_portal(id) on delete cascade,
  step_id                 uuid not null references public.steps_config(id) on delete cascade,
  google_event_id         text not null,
  meeting_url             text,
  start_time              timestamptz not null,
  end_time                timestamptz not null,
  status                  text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled')),
  created_at              timestamptz not null default now(),
  unique (candidate_in_portal_id, step_id)
);

create index if not exists idx_bookings_candidate_step
  on public.bookings (candidate_in_portal_id, step_id);

-- Helpful when an admin wants to see recent bookings for a step in aggregate.
create index if not exists idx_bookings_step_time
  on public.bookings (step_id, start_time);

alter table public.bookings enable row level security;
-- No public policies: all reads/writes go through the portal's service-role
-- server actions. If we ever expose a client-side read path, add a policy
-- that joins through candidates_in_portal and matches the session token.
