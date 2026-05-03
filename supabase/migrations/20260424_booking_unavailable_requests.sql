-- PR 40: scheduling escape hatch.
--
-- When a candidate's availability doesn't match any slot in the schedule
-- grid, they need a way to signal "none of these times work — here's what
-- would". This table captures those requests so growth leaders can reach
-- out manually. No email/Slack notification yet — that lands in a later
-- PR; for now the admin candidates page surfaces a badge per pending row.

create table if not exists booking_unavailable_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_in_portal_id uuid not null
    references candidates_in_portal(id) on delete cascade,
  email text not null,
  available_times text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists booking_unavailable_requests_candidate_idx
  on booking_unavailable_requests (candidate_in_portal_id);

-- Admin landing surface filters on status; index it too.
create index if not exists booking_unavailable_requests_status_idx
  on booking_unavailable_requests (status);

alter table booking_unavailable_requests enable row level security;
