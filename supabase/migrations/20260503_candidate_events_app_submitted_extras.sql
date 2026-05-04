-- PR 61: track the two extra Zoho sync calls that fire on the
-- application_submitted milestone (CQ_Received DateTime + tag).
-- Stays NULL for every other milestone — same pattern as
-- blueprint_transition_status, which is also milestone-specific.
--
-- Run against the **bm-candidate-portal** Supabase project.

alter table candidate_events
  add column if not exists cq_sync_status text,
  add column if not exists cq_sync_error text,
  add column if not exists tag_sync_status text,
  add column if not exists tag_sync_error text;
