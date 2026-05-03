-- PR 42: phone prefill on the candidate session.
--
-- Mirrors prefilled_zip from PR 37. When set, the application's verification
-- screen pre-populates the phone field and shows a small "Prefilled from
-- your record" hint. Field stays editable. For now the dev seed sets these
-- values per test brand; production will populate at candidate creation
-- time via the Zoho lead webhook.

alter table candidates_in_portal
  add column if not exists prefilled_phone text;
