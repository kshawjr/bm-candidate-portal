-- PR: add call_prep to the allowed content types on steps_config.
-- Apply manually via the SQL editor against bm-candidate-portal before
-- deploying the code that inserts/reads this type.

alter table steps_config drop constraint steps_config_content_type_check;
alter table steps_config
  add constraint steps_config_content_type_check
  check (content_type in ('slides', 'static', 'application', 'video', 'schedule', 'call_prep', 'document', 'checklist'));
