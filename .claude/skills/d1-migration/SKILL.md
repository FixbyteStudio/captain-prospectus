---
name: d1-migration
description: Change the D1 database schema safely with Drizzle and wrangler. Use whenever src/worker/db/schema.ts must change.
---

# D1 migration

Migrations run in CI **before** the new Worker deploys. The old Worker must survive the new schema.

## Steps
1. Edit `src/worker/db/schema.ts`.
2. `pnpm db:generate` → new file in `drizzle/`. Read the SQL.
3. `pnpm db:migrate:local`, run the app and tests.
4. Update `docs/data-model.md` (ERD + rules + indexes).
5. Ask the `migration-guard` subagent to review.

## Safe in one release
- New table.
- New nullable column, or NOT NULL **with a default**.
- New index.

## Needs two releases (expand → contract)
| Change | Release 1 | Release 2 |
|---|---|---|
| Rename column | add new column, write both, read new | drop old |
| Drop column | stop reading/writing it | drop it |
| Make column NOT NULL | backfill + code always writes it | add constraint (table rebuild) |

## Never
- Edit a migration already merged to `main`.
- Update or delete rows in `visits` (append-only).
- Run `db:migrate:remote` yourself.
