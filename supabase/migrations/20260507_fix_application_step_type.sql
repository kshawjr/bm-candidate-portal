-- The canonical Stop 1 contract is two steps: a `slides` brand tour
-- followed by an `application` light application. scripts/seed.ts:119
-- defines the second step as `{ key: "app", type: "application" }` and
-- the candidate-portal flow assumes that contract throughout (the cinematic
-- shell's StepRenderer only ever routes step_key="app" through
-- ApplicationRenderer when content_type === "application").
--
-- A live brand row drifted to content_type='slides' on its explore/app
-- step — most likely from an accidental edit through the admin "Update
-- step" flow, which permits arbitrary type changes. Symptom: /admin/content
-- showed the SlideEditor (with stale slides leaked in via config.slides)
-- where the application notice should render.
--
-- Restore the canonical type on every brand. Idempotent: rows already at
-- 'application' are no-ops. config.slides on the affected row is left in
-- place — it's inert under content_type='application' and keeping it
-- gives the team an undo if a row was deliberately reshaped (no known
-- case, but cheap insurance).

update steps_config
set content_type = 'application'
where chapter_key = 'explore'
  and step_key = 'app'
  and content_type <> 'application';
