-- F4: convert the "Your journey ahead" roadmap from a hard-coded render
-- on every explore-chapter slides step into a reorderable content card.
--
-- The card is a marker (no per-instance config) — the timeline data and
-- brand decoration come from candidate state and brand slug at render
-- time, so we only need to ensure exactly one journey_ahead card sits in
-- the content_cards JSONB array on each explore-chapter slides step.
--
-- Idempotent: if the card is already present, do nothing.

update steps_config
set content_cards = coalesce(content_cards, '[]'::jsonb)
  || '[{"type":"journey_ahead"}]'::jsonb
where chapter_key = 'explore'
  and content_type = 'slides'
  and not (
    coalesce(content_cards, '[]'::jsonb) @> '[{"type":"journey_ahead"}]'::jsonb
  );
