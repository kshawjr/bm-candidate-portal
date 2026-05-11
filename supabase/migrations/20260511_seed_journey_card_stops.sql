-- Seed the per-stop title + caption array on existing journey_ahead
-- cards. Before this migration, journey_ahead cards in
-- steps_config.content_cards had no `stops` field — the renderer
-- showed the 8 hardcoded titles/bodies from journey-timeline.tsx.
-- After this migration, every existing journey_ahead card carries
-- the same copy explicitly in its config, so admins can edit it
-- through the new JourneyAheadForm without seeing blank fields on
-- first open.
--
-- Idempotent: only updates a card if `stops` is absent from it. Cards
-- already carrying a `stops` array (edited after this PR ships) are
-- left untouched.
--
-- The 8 stop strings below must match DEFAULT_JOURNEY_STOPS in
-- components/content-cards/journey-defaults.ts verbatim — that's the
-- TS-side fallback the renderer uses when stops is still absent.

with default_stops as (
  select '[
    {"title":"Questionnaire","caption":"Five minutes. Confirms market availability and financial fit."},
    {"title":"Discovery Call","caption":"Two-way conversation. Your goals, our opportunity. Clear expectations set."},
    {"title":"Investment & Unit Economics","caption":"Full financial breakdown. FDD sent. Budget tool provided. Numbers on the table."},
    {"title":"FDD Exploration","caption":"Walk through key FDD items. Financial verification. Territory discussion."},
    {"title":"Due Diligence","caption":"Territory confirmed. Validation calls with current franchisees."},
    {"title":"Visionary Call","caption":"Direct conversation with Co-CEOs. Vision and future explored."},
    {"title":"Confirmation Day","caption":"Meet the full support team. Final mutual alignment."},
    {"title":"Signing Day & Award","caption":"Agreement executed. Onboarding begins. Your territory is secured."}
  ]'::jsonb as stops
)
update steps_config s
set content_cards = (
  select jsonb_agg(
    case
      when card->>'type' = 'journey_ahead' and not (card ? 'stops')
        then card || jsonb_build_object('stops', (select stops from default_stops))
      else card
    end
  )
  from jsonb_array_elements(s.content_cards) as card
)
where exists (
  select 1
  from jsonb_array_elements(s.content_cards) as card
  where card->>'type' = 'journey_ahead'
    and not (card ? 'stops')
);
