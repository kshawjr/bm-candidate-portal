-- PR: waiting content type + unlock keys (Portal_Unlocks → unlocked_keys).
-- Apply manually via the SQL editor against the **bm-candidate-portal**
-- Supabase project before deploying the code that reads / writes this
-- column. The zoho-lead-updated webhook is the writer; the waiting
-- content type's renderer is the reader (subscribed via realtime).

-- 1) Per-candidate unlocked-keys array on the portal session table.
--    text[] holds the active keys from Zoho's Portal_Unlocks multi-select
--    picklist (e.g. {'webinar_unlocked','discovery_day_unlocked'}). The
--    webhook full-replaces this on every Zoho Lead update so removals
--    propagate too. Defaults to '{}' so legacy rows continue to render
--    as "nothing unlocked yet."
alter table candidates_in_portal
  add column if not exists unlocked_keys text[] not null default '{}';

create index if not exists idx_candidates_in_portal_unlocked_keys
  on candidates_in_portal using gin (unlocked_keys);

-- 2) Allow 'waiting' as a content_type on steps_config. Drop the existing
--    CHECK constraint (added by 20260422_call_prep_content_type.sql) and
--    re-add it with the new value. Order matches the constants in
--    lib/unlock-keys.ts + components/cinematic-shell.tsx; keep them in
--    sync when the list grows again.
alter table steps_config drop constraint if exists steps_config_content_type_check;
alter table steps_config
  add constraint steps_config_content_type_check
  check (
    content_type in (
      'slides',
      'static',
      'application',
      'video',
      'schedule',
      'call_prep',
      'document',
      'checklist',
      'waiting'
    )
  );
