-- PR 16 polish: brands.short_name
--
-- Run against the **bmave-core** Supabase project. Adds a conversational
-- display name that candidate-facing surfaces use instead of the full
-- brand name. Falls back to `name` in the app when null.
--
-- Seed values (set by scripts/seed.ts):
--   "Hounds Town USA" → "Hounds Town"
--   "Cruisin' Tikis"  → null (name is already conversational)

alter table public.brands
  add column if not exists short_name text;
