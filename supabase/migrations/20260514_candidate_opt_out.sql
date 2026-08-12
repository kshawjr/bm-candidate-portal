-- Candidate opt-out: three nullable columns on candidates_in_portal.
-- opted_out_at drives the portal lock (null = active); reengage clears
-- it while opted_out_reason stays as historical context; the reengage
-- timestamp lives on its own column for audit + rep-alert triggering.
alter table candidates_in_portal
  add column opted_out_at timestamptz,
  add column opted_out_reason text,
  add column opted_out_reengage_requested_at timestamptz;
