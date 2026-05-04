-- PR 63: candidate_applications table.
--
-- Run against the **flightdeck** Supabase project (NOT
-- bm-candidate-portal). This table is owned by the flightdeck app,
-- but bm-candidate-portal writes to it directly via a service-role
-- cross-project client (see lib/flightdeck-client.ts) — same pattern
-- as the bm-candidate-portal → bmave-core writes.
--
-- The `token` column carries the candidate's portal access token
-- (e.g., 'ht-7kF2mQ9NpW3R'). It's the cross-system identifier the
-- flightdeck UI uses to look up an application; when the Zoho lead
-- later converts to a deal, the deal references this same token to
-- link back to the application record.
--
-- No unique constraint on token / zoho_lead_id intentionally — every
-- submission attempt is recorded as a separate row, which preserves
-- history if a candidate resubmits after a reset. The flightdeck
-- consumer queries `order by submitted_at desc limit 1` to get the
-- latest.

create table if not exists candidate_applications (
  id uuid primary key default gen_random_uuid(),

  -- Cross-system identifiers
  token text not null,
  zoho_lead_id text,
  zoho_deal_id text,

  brand_id uuid not null,
  brand_slug text not null,

  -- Submission metadata
  submitted_at timestamptz not null default now(),
  source text default 'portal',

  -- Document URL
  pdf_url text,
  pdf_filename text,

  -- Identity (from bmave-core.candidates — the application form
  -- itself doesn't split first/last; we copy the canonical split
  -- from bmave-core at submission time so flightdeck doesn't need
  -- the cross-project read).
  legal_first_name text,
  legal_last_name text,
  preferred_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  country text default 'USA',

  -- Demographic / eligibility (not currently collected by the form;
  -- columns exist for forward compatibility).
  birth_date date,
  citizenship text,

  -- Background
  has_bankruptcy boolean,
  bankruptcy_explanation text,
  has_felony boolean,
  felony_explanation text,

  -- Financial (range strings — the form uses 5-bucket dropdowns).
  liquid_capital text,
  net_worth text,

  -- Investment plans (the *_other text values get folded inline as
  -- "Other: <text>" so flightdeck doesn't need to track parallel
  -- columns).
  opening_timeline text,
  involvement_level text,
  growth_plan text,
  motivation_chips jsonb default '[]'::jsonb,
  motivation_elaboration text,

  -- Brand-specific closing question. Stored as
  --   { "value": "<chip>" }                  for chip selections, or
  --   { "value": "other", "other_text": "..." }   for free-text.
  closing_question_response jsonb,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidate_applications_token
  on candidate_applications (token);
create index if not exists idx_candidate_applications_zoho_lead
  on candidate_applications (zoho_lead_id);
create index if not exists idx_candidate_applications_brand
  on candidate_applications (brand_id);
create index if not exists idx_candidate_applications_submitted_at
  on candidate_applications (submitted_at desc);
