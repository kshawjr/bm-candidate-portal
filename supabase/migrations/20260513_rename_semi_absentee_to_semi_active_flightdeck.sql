-- PR 112 (Ashly app review): rename the involvement_level value
-- "semi_absentee" → "semi_active" to match the new candidate-facing
-- chip label.
--
-- Run against the **flightdeck** Supabase project. Same cross-project
-- pattern as the other _flightdeck migrations — candidate_applications
-- is owned by the flightdeck app and written to by bm-candidate-portal
-- via service-role.
--
-- The label/value swap in components/content-types/application-renderer.tsx
-- only affects new submissions. Existing rows keep the old value until
-- this migration runs. Without it, the PDF generator + Zoho mirror would
-- continue to display "semi_absentee" for historical applications.

update candidate_applications
set involvement_level = 'semi_active'
where involvement_level = 'semi_absentee';
