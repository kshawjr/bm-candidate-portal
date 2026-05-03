-- PR 51: Zoho lead-creation webhook receiver — track originating lead.
--
-- Run against the **bmave-core** Supabase project. Adds a column to
-- public.candidates that stores Zoho's internal Lead_ID for the lead
-- record that produced this candidate. Used by the
-- /api/webhooks/zoho-lead-created receiver as the idempotency key:
-- Zoho fires the webhook once, but workflow retries / our own retries
-- could fire it again. Keying on zoho_lead_id lets us return the same
-- token instead of creating a duplicate candidate.
--
-- Partial unique index (only enforced when zoho_lead_id is set) so
-- existing rows with NULL don't all collide and so manually-seeded
-- dev candidates (which have no originating lead) can coexist.

alter table public.candidates
  add column if not exists zoho_lead_id text;

create unique index if not exists idx_candidates_zoho_lead_id
  on public.candidates (zoho_lead_id)
  where zoho_lead_id is not null;
