-- PR 16: schedule content type — brands.advisor_calendar_email
--
-- Run manually against the **bmave-core** Supabase project. This is the
-- shared brand registry; the column is read by any Blue Maven app that
-- needs to find the franchise-growth lead's calendar for a given brand.

alter table public.brands
  add column if not exists advisor_calendar_email text;
