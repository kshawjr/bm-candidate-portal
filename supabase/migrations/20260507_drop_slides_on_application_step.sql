-- The application step (chapter_key='explore', step_key='app') still
-- has config.slides left over from before #72 flipped its content_type
-- to 'application'. #72's call to keep that data as "inert backup"
-- is now an active liability: even though the editor's dispatch never
-- reads slides on an application row, leaving the JSONB key in place
-- invites future drift (e.g. an admin flipping content_type back
-- reveals stale slides from another step). Drop the key entirely.
--
-- Idempotent: jsonb `- 'slides'` on a row that no longer has the key
-- is a no-op, and the WHERE clause filters those rows out anyway.

update steps_config
set config = config - 'slides'
where chapter_key = 'explore'
  and step_key = 'app'
  and config ? 'slides';
