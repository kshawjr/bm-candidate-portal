-- Persist which step the candidate was last on so step transition
-- videos can still fire after a router.refresh(). The in-content Next
-- button on a step's primary editor calls advanceStepAction →
-- router.refresh() → the cinematic-shell remounts. Its in-memory
-- `lastStepIdRef` resets to the new current step, so the existing
-- step-change effect's previousStepId would be lost and the matching
-- transition video would never fire on linear progression.
--
-- Server-side trigger: advanceStepAction writes the old step id here
-- before bumping current_step. Page component reads it and surfaces
-- to the shell as `pendingTransitionVideoStepId`. Cleared by the
-- video's dismiss handler so subsequent reloads don't re-fire.
alter table candidates_in_portal
  add column if not exists last_visited_step_id uuid;
