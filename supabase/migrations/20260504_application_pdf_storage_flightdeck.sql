-- PR 63: storage bucket for application PDFs.
--
-- Run against the **flightdeck** Supabase project. Private bucket —
-- the flightdeck UI fetches PDFs via signed URLs (or direct
-- service-role queries from server-side code).
--
-- bm-candidate-portal uploads to this bucket via the flightdeck
-- service-role key on application submission.

insert into storage.buckets (
  id, name, public, created_at, updated_at,
  allowed_mime_types, file_size_limit
)
values (
  'application-pdfs',
  'application-pdfs',
  false,
  now(),
  now(),
  array['application/pdf']::text[],
  10 * 1024 * 1024  -- 10MB max — well above any reasonable application PDF
)
on conflict (id) do nothing;

-- Service role: full access. This is what bm-candidate-portal's
-- upload uses, and what flightdeck's server-side code uses.
create policy "Service role can manage application PDFs"
  on storage.objects
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Authenticated users (flightdeck app users): read-only. Tighten if
-- the flightdeck team adds row-level scoping later (e.g., only
-- brand-scoped users can read their brand's PDFs).
create policy "Authenticated users can read application PDFs"
  on storage.objects
  for select
  using (
    bucket_id = 'application-pdfs'
    and (auth.role() = 'authenticated' or auth.role() = 'service_role')
  );
