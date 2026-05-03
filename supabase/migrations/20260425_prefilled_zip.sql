-- PR 37: ZIP prefill on the candidate session.
--
-- Stores a candidate's ZIP code so the location step in the Chapter 1
-- application can skip the cold-input flow and go straight to the
-- "We have you in <city, state>" confirmation card.
--
-- For now this is populated by the dev seed (HT test candidate gets a
-- value, CT test candidate doesn't, so we exercise both flows). When
-- the Zoho candidate-creation webhook lands, it will write this from
-- whatever ZIP the lead provided to begin with.

alter table candidates_in_portal
  add column if not exists prefilled_zip text;
