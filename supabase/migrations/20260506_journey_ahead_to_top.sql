-- Followup to 20260505_journey_ahead_card.sql.
--
-- The original migration appended `{"type":"journey_ahead"}` to the end
-- of content_cards via jsonb concat (`||`). On brands that already had
-- cards seeded by scripts/seed.ts (fact, personas, quote, awards), the
-- timeline ended up rendering BELOW everything — the opposite of what
-- a "Your journey ahead" preview should do.
--
-- Move it to index 0. Idempotent: running this twice produces the same
-- array (one journey_ahead at the front, plus the deduped rest). Also
-- collapses any accidental duplicates into a single instance.

update steps_config
set content_cards = (
  jsonb_build_array(jsonb_build_object('type', 'journey_ahead'))
  || coalesce(
    (
      select jsonb_agg(elem)
      from jsonb_array_elements(content_cards) elem
      where elem->>'type' != 'journey_ahead'
    ),
    '[]'::jsonb
  )
)
where content_cards @> '[{"type":"journey_ahead"}]'::jsonb;
