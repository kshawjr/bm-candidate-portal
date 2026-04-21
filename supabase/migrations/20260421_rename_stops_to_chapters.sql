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
alter table public.candidates_in_portal rename column current_stop to current_chapter;
