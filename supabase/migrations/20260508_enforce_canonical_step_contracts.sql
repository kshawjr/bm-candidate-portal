-- Defensive: scan steps_config for rows where (chapter_key, step_key)
-- matches a canonical Stop 1 contract but content_type has drifted.
-- Patch them back. Idempotent — re-running on clean rows is a no-op.
--
-- Canonical contracts source-of-truth: lib/canonical-steps.ts. Keep this
-- file in sync when the contract list changes.
--
-- PR #72 already fixed the application step on production
-- (20260507_fix_application_step_type.sql); this migration generalizes
-- that pattern to every canonical (chapter_key, step_key) — covering
-- existing brand drift on any of the 15 canonical steps and any future
-- brand seeded with diverged data before the lockdown took effect.

-- Chapter 1 — Explore
update steps_config set content_type = 'slides'
  where chapter_key = 'explore' and step_key = 'tour' and content_type <> 'slides';
update steps_config set content_type = 'application'
  where chapter_key = 'explore' and step_key = 'app' and content_type <> 'application';

-- Chapter 2 — First chat
update steps_config set content_type = 'schedule'
  where chapter_key = 'first_chat' and step_key = 'book' and content_type <> 'schedule';

-- Chapter 4 — Playbook
update steps_config set content_type = 'static'
  where chapter_key = 'playbook' and step_key = 'intro' and content_type <> 'static';
update steps_config set content_type = 'document'
  where chapter_key = 'playbook' and step_key = 'document' and content_type <> 'document';
update steps_config set content_type = 'checklist'
  where chapter_key = 'playbook' and step_key = 'questions' and content_type <> 'checklist';

-- Chapter 5 — Verify
update steps_config set content_type = 'checklist'
  where chapter_key = 'verify' and step_key = 'background' and content_type <> 'checklist';
update steps_config set content_type = 'checklist'
  where chapter_key = 'verify' and step_key = 'financial' and content_type <> 'checklist';
update steps_config set content_type = 'static'
  where chapter_key = 'verify' and step_key = 'validation' and content_type <> 'static';

-- Chapter 6 — Visit
update steps_config set content_type = 'static'
  where chapter_key = 'visit' and step_key = 'invite' and content_type <> 'static';
update steps_config set content_type = 'static'
  where chapter_key = 'visit' and step_key = 'travel' and content_type <> 'static';
update steps_config set content_type = 'static'
  where chapter_key = 'visit' and step_key = 'agenda' and content_type <> 'static';

-- Chapter 7 — Award
update steps_config set content_type = 'document'
  where chapter_key = 'award' and step_key = 'review' and content_type <> 'document';
update steps_config set content_type = 'static'
  where chapter_key = 'award' and step_key = 'sign' and content_type <> 'static';
update steps_config set content_type = 'static'
  where chapter_key = 'award' and step_key = 'welcome' and content_type <> 'static';
