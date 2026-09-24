/**
 * INVARIANT 3: prospect status is derived from visits, by the server.
 *
 * Two callers reach this — `POST /api/agent/sync` when a phone pushes a visit,
 * and the orphan repair endpoint when an admin attaches a quarantined one
 * (ADR-0022). They have to agree, and the way two copies of this stop agreeing
 * is that only one of them gets fixed.
 */
import { desc, eq, sql } from "drizzle-orm";
import { OUTCOME_TO_STATUS } from "../../shared/constants";
import { prospects, visits } from "../db/schema";
import type { Db } from "../db/client";

/**
 * Recompute one prospect's status from its own visits.
 *
 * Only the latest visit by `visited_at` moves it, so a late-syncing older visit
 * is stored without overwriting a newer outcome (ADR-0011). `visited_at` is
 * already clamped to the server clock on insert, so a phone ahead by a week
 * cannot win this comparison for ever (INVARIANT 12).
 *
 * Nor does it overwrite a newer decision: when an admin set the status by hand
 * at or after that visit, the status and `next_visit_at` stay theirs and only
 * `last_visit_at` moves (ADR-0025). One conditional UPDATE rather than a read
 * then a write, so an admin edit landing in between cannot be lost.
 *
 * `now` is passed in rather than read here so every row a single request
 * touches carries the same `updated_at`, which is what makes the admin list's
 * ordering stable within one sync.
 */
export async function deriveProspectStatus(db: Db, prospectId: string, now: number) {
  const [latest] = await db
    .select({
      outcome: visits.outcome,
      visitedAt: visits.visitedAt,
      followUpAt: visits.followUpAt,
    })
    .from(visits)
    .where(eq(visits.prospectId, prospectId))
    .orderBy(desc(visits.visitedAt))
    .limit(1);
  if (!latest) return;

  const visitWins = sql`(${prospects.statusSetAt} IS NULL OR ${prospects.statusSetAt} < ${latest.visitedAt})`;

  await db
    .update(prospects)
    .set({
      status: sql`CASE WHEN ${visitWins} THEN ${OUTCOME_TO_STATUS[latest.outcome]} ELSE ${prospects.status} END`,
      lastVisitAt: latest.visitedAt,
      nextVisitAt: sql`CASE WHEN ${visitWins} THEN ${latest.followUpAt} ELSE ${prospects.nextVisitAt} END`,
      updatedAt: now,
    })
    .where(eq(prospects.id, prospectId));
}
