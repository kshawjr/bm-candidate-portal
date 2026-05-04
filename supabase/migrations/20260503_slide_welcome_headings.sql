-- PR 58: greet candidates immediately on the first slide so the portal
-- doesn't open into an unaddressed image. The slide model stores a
-- heading per-slide as `slides[i].heading` inside `steps_config.config`
-- (PR 58 also added `heading` to the Slide type + admin normalizer so
-- this value survives subsequent admin edits).
--
-- Brand IDs are the canonical bmave-core.brands ids for HT and CT.
-- A future brand will need its own UPDATE here (or a generalized
-- migration that joins on chapter_key + step_key alone).

update steps_config
set config = jsonb_set(
  config,
  '{slides,0,heading}',
  '"Welcome to Hounds Town"'::jsonb,
  true
)
where brand_id = 'feb1fc5a-6839-41c0-8d3d-7f3deb0a1b83'
  and chapter_key = 'explore'
  and step_key = 'tour';

update steps_config
set config = jsonb_set(
  config,
  '{slides,0,heading}',
  '"Welcome to Cruisin'' Tikis"'::jsonb,
  true
)
where brand_id = 'af772a65-c5f4-4a6c-a140-e1ecb715b2ae'
  and chapter_key = 'explore'
  and step_key = 'tour';
