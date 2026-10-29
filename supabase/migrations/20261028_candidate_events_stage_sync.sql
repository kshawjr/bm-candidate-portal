-- Track the FranFunnel_Stage ("Portal Stage") outcome for the four
-- milestones that drive it (portal_first_visit, education_completed,
-- application_submitted, discovery_scheduled). Same pattern as
-- tag_sync_status / cq_sync_status: NULL on every other milestone.
--
-- Values: 'success' (written), 'skipped' (forward-only rule said no,
-- or no zoho_lead_id), 'failed' (Zoho read failed / lead not found /
-- the main update carrying the stage failed — reason in
-- stage_sync_error).
--
-- Run against the **bm-candidate-portal** Supabase project.

alter table candidate_events
  add column if not exists stage_sync_status text,
  add column if not exists stage_sync_error text;
