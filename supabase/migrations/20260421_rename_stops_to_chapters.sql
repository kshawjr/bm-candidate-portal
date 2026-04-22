-- PR 20: rename "stop" concept to "chapter" across the schema.
-- Only naming — no data changes. Existing rows preserve their keys and
-- positions. "step" terminology is untouched (only stop → chapter).
-- Apply against the bm-candidate-portal Supabase project via the SQL
-- editor; the app code in this PR assumes these names.

-- Table rename (indexes, constraints, and sequences follow automatically).
alter table public.stops_config rename to chapters_config;

-- Column renames.
alter table public.chapters_config rename column stop_key to chapter_key;
alter table public.steps_config rename column stop_key to chapter_key;
alter table public.candidate_progress rename column stop_key to chapter_key;
alter table public.candidates_in_portal rename column current_stop to current_chapter;

-- Sanity check before applying — surfaces any other columns we missed.
-- Expected to return zero rows after this migration runs:
--   select table_name, column_name
--   from information_schema.columns
--   where column_name ilike '%stop%' and table_schema = 'public';
