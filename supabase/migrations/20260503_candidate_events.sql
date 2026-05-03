-- Candidate progress events. One row per meaningful interaction.
-- High-frequency events (pages visited, form changes) accepted —
-- query patterns are specific (recent N for a candidate, count by
-- type) and we keep it simple/uncapped.

create table candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,  -- references bmave-core.candidates(id) by app convention
  brand_id uuid not null,

  -- High-level category. Keep cardinality low.
  -- 'milestone' | 'engagement' | 'form' | 'page' | 'action'
  category text not null,

  -- Specific event identifier.
  -- Examples: 'application_submitted', 'chapter_completed', 'step_viewed', 'page_visited'
  event_type text not null,

  -- Optional context for grouping. Examples:
  -- 'first_chat' for a chapter event, '/portal/{token}/chapter/explore' for a page visit
  event_key text,

  -- Free-form metadata for whatever the event needs.
  -- Examples: { "step_index": 3 }, { "field": "first_name" }, { "video_id": "..." }
  metadata jsonb default '{}'::jsonb,

  -- Whether this event has been synced to Zoho (only for milestones).
  -- null = not eligible for sync. timestamp = when synced.
  zoho_synced_at timestamptz,
  zoho_sync_status text,  -- null | 'pending' | 'success' | 'failed' | 'skipped'
  zoho_sync_error text,

  created_at timestamptz not null default now()
);

-- Composite index for common queries: events for one candidate, ordered chronologically
create index idx_candidate_events_candidate_time
  on candidate_events(candidate_id, created_at desc);

-- Index for milestone queries (admin dashboards, status counts)
create index idx_candidate_events_category_type_time
  on candidate_events(category, event_type, created_at desc);

-- Index for Zoho sync worker
create index idx_candidate_events_zoho_sync_pending
  on candidate_events(zoho_sync_status)
  where zoho_sync_status in ('pending', 'failed');

-- Service-role only. The portal accesses Supabase via the service-role
-- client (createAppServiceClient); no end-user policies needed.
alter table candidate_events enable row level security;
