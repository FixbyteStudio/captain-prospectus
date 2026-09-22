-- Two rules docs/domains/scripts.md states and the schema never enforced:
-- "exactly one active script at a time in v1", and a version being a version
-- *of* a script. Both are indexes, but a database written before them can
-- already break them, so each is preceded by the repair it needs.
--
-- A local database seeded more than once has one active script per seed:
-- `POST /api/dev/seed` inserts with `onConflictDoNothing()` and, with no
-- constraint to conflict on, that did nothing. Both statements below are
-- no-ops on a database that was already correct.

-- Stand down every active script but the newest. Nothing is deleted: an old
-- version is exactly what `is_active = 0` is for, and `visits.script_id`
-- references the id, so history stays readable.
UPDATE scripts SET is_active = 0
WHERE is_active = 1
  AND id <> (
    SELECT id FROM scripts WHERE is_active = 1 ORDER BY created_at DESC, id DESC LIMIT 1
  );
--> statement-breakpoint
-- Renumber versions so they are consecutive within a name, oldest row first.
-- Safe because a visit records the script's *id*, never its version number.
UPDATE scripts SET version = (
  SELECT COUNT(*) FROM scripts AS earlier
  WHERE earlier.name = scripts.name AND earlier.id <= scripts.id
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scripts_one_active_idx` ON `scripts` (`is_active`) WHERE "scripts"."is_active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `scripts_name_version_idx` ON `scripts` (`name`,`version`);
