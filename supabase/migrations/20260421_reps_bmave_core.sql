-- PR 16 (revision): reps table + candidate assignment
--
-- Run against the **bmave-core** Supabase project. This is the canonical
-- rep registry read by every Blue Maven app that needs to know who a
-- candidate is working with.
--
-- Scheduling in the Candidate Portal resolves the booking calendar via
-- candidates.assigned_rep_id → reps.calendar_email. The earlier
-- brands.advisor_calendar_email column stays in the schema as a
-- deprecated fallback but is no longer read by the schedule flow.

create table if not exists public.reps (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  email           text unique not null,
  calendar_email  text not null,
  role            text,
  avatar_url      text,
  zoho_user_id    text unique,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_reps_email         on public.reps (email);
create index if not exists idx_reps_zoho_user_id  on public.reps (zoho_user_id);

alter table public.candidates
  add column if not exists assigned_rep_id uuid references public.reps(id);

create index if not exists idx_candidates_assigned_rep_id
  on public.candidates (assigned_rep_id);

alter table public.reps enable row level security;
-- No public policies: all reads/writes go through service-role server
-- actions (portal + FlightDeck). Add a read-through policy when a
-- candidate-facing display of the rep roster is needed.
