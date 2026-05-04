-- PR 56: track Zoho Blueprint transition status alongside the existing
-- field-update sync. Same null/'pending'/'success'/'failed'/'skipped'
-- vocabulary as zoho_sync_status — milestones whose event_type isn't
-- mapped to a transition (e.g., portal_first_visit) are 'skipped'.

alter table candidate_events
  add column if not exists blueprint_transition_status text,
  add column if not exists blueprint_transition_error text;
