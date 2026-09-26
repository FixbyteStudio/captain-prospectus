/**
 * Today's progress line — GH #119, docs/design.md's "2 visites sur 5
 * aujourd'hui" with a bar, and the dedupe-by-id union of the log and the
 * pending outbox (docs/domains/field-operations.md).
 *
 * Pure aside from importing `sendableBy` from `db.ts` — one definition of
 * "mine" (invariant: the outbox side and the log side must agree). `db.ts`
 * constructs `fieldDb` at module scope but never opens it here, so this
 * module still runs with no Dexie and no browser under test.
 */
import { sendableBy, type SentVisit, type StoredVisit } from "./db";

export type DailyProgressValue = { n: number; total: number; percent: number };

/**
 * `n` is the log unioned with the pending outbox, deduplicated by visit id —
 * a visit queued by an older build has no log entry, so the union (not the
 * log alone) is what still counts it. The outbox side is bound to `period`
 * the same way `todaysSentVisits` already bounds the log: without it, a
 * visit queued yesterday and still unsent this morning would count as
 * today's, and the agent's line would disagree with the admin's "Visites
 * aujourd'hui" (docs/domains/field-operations.md).
 *
 * `total` is the round's own size, not `n + stops.length`: the round
 * deliberately keeps a stop on the list after its visit is queued (invariant
 * 3 — status is server-derived), so adding the two would double-count every
 * visit the agent records. It is the size of the *union* of counted
 * prospect ids and the stops still on the list, not `n` plus the
 * uncounted stops — a union, so a second visit to an already-counted stop
 * never grows it, and a stop that has since moved to "Plus tard" and is no
 * longer in `stops` still holds its place because it is still in `n`.
 */
export function dailyProgress({
  logged,
  outboxVisits,
  identity,
  stops,
  period,
}: {
  logged: readonly SentVisit[];
  outboxVisits: readonly StoredVisit[];
  identity: string;
  stops: readonly { id: string }[];
  /** The Brussels calendar day, from `src/shared/period.ts`. */
  period: { from: number; to: number };
}): DailyProgressValue {
  const mine = sendableBy(identity);
  const isToday = (visitedAt: number) => visitedAt >= period.from && visitedAt < period.to;
  const visitIds = new Set<string>();
  const countedProspectIds = new Set<string>();

  for (const row of logged) {
    if (!mine(row)) continue;
    visitIds.add(row.id);
    countedProspectIds.add(row.prospectId);
  }
  for (const row of outboxVisits) {
    if (!mine(row) || !isToday(row.visitedAt)) continue;
    visitIds.add(row.id);
    countedProspectIds.add(row.prospectId);
  }

  const n = visitIds.size;
  const total = new Set([...countedProspectIds, ...stops.map((stop) => stop.id)]).size;
  const percent = total === 0 ? 0 : Math.round((n / total) * 100);

  return { n, total, percent };
}
