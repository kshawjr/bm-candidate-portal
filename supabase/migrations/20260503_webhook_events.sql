-- PR 51: webhook_events audit log.
--
-- Run against the **bm-candidate-portal** Supabase project. Persists
-- every inbound webhook (currently just Zoho lead-created, but the
-- shape is generic for future receivers) for debugging + replay. We
-- write a 'pending' row before doing any work, then update it to
-- 'success' or 'failed' with the resulting candidate_id or
-- error_message. Keep the raw payload as jsonb so we can re-run
-- against a row if a downstream bug lands.
--
-- Not exposed via RLS to anon — service-role only.

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source text not null,
  payload jsonb not null,
  status text not null default 'pending',
  candidate_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_webhook_events_status_type
  on webhook_events (status, event_type);

create index if not exists idx_webhook_events_candidate
  on webhook_events (candidate_id);
