-- PR 117 (seed idempotency): per-row uniqueness on the journey-structure
-- tables so the seed can do safe lookup-then-insert per (brand_id,
-- chapter_key, step_key) without clobbering admin edits.
--
-- Run against the **bm-candidate-portal** Supabase project before
-- merging the seed refactor that depends on these constraints.
--
-- The matching seed code (scripts/seed.ts → seedChapters + seedSteps)
-- already does its own existence check before inserting, but the
-- constraints here are the DB-level safety net — duplicate
-- (brand_id, chapter_key, step_key) inserts via raw SQL or admin UI
-- now fail loudly instead of producing dual rows the renderer can't
-- choose between.

-- ---------- duplicate pre-check ----------
-- Reject the migration if any existing duplicates would block the new
-- constraint. Mostly defensive — the seed has never produced dupes —
-- but cheap insurance against a bad ad-hoc insert from earlier
-- experimentation.
do $$
declare
  steps_dup_count int;
  chapters_dup_count int;
begin
  select count(*) into steps_dup_count from (
    select brand_id, chapter_key, step_key
    from steps_config
    where step_key is not null
    group by brand_id, chapter_key, step_key
    having count(*) > 1
  ) dups;
  if steps_dup_count > 0 then
    raise exception 'Cannot add steps_config unique constraint: % duplicate (brand_id, chapter_key, step_key) combinations exist', steps_dup_count;
  end if;

  select count(*) into chapters_dup_count from (
    select brand_id, chapter_key
    from chapters_config
    where chapter_key is not null
    group by brand_id, chapter_key
    having count(*) > 1
  ) dups;
  if chapters_dup_count > 0 then
    raise exception 'Cannot add chapters_config unique constraint: % duplicate (brand_id, chapter_key) combinations exist', chapters_dup_count;
  end if;
end$$;

-- ---------- steps_config ----------
-- Partial index on step_key IS NOT NULL is defensive — step_key is
-- not-null in the schema today, so the WHERE clause is effectively a
-- no-op. Keeping it future-proofs against a hypothetical schema relax
-- (separator rows with null step_key, etc.).
create unique index if not exists steps_config_brand_chapter_step_unique
  on steps_config (brand_id, chapter_key, step_key)
  where step_key is not null;

-- ---------- chapters_config ----------
-- Same shape; chapter_key is not-null per schema. Future-proof clause.
create unique index if not exists chapters_config_brand_chapter_unique
  on chapters_config (brand_id, chapter_key)
  where chapter_key is not null;
