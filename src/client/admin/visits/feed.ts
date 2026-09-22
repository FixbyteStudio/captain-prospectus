/**
 * The live feed's cursor — ADR-0010, docs/design.md "The live feed".
 *
 * Pure, so it can be tested: nothing renders a component in this repo's tests,
 * so the part worth pinning lives here and `VisitsScreen` only draws it.
 */
import type { AdminVisit } from "../../../shared/schemas";

/**
 * Fold a poll's answer into what the screen already holds.
 *
 * De-duplicated by id and re-sorted, because `since` being exclusive is not
 * quite enough on its own: two visits can share a `receivedAt` millisecond, and
 * the cursor would then either re-deliver one or skip it. Keeping the merge
 * idempotent means a re-delivery is free and the cursor can stay inclusive-safe.
 */
export function mergeVisits(
  existing: readonly AdminVisit[],
  incoming: readonly AdminVisit[],
): AdminVisit[] {
  if (incoming.length === 0) return existing as AdminVisit[];

  const byId = new Map(existing.map((visit) => [visit.id, visit]));
  for (const visit of incoming) byId.set(visit.id, visit);

  return [...byId.values()].sort(
    // Newest first, and `id` as the tie-break so two visits received in the
    // same millisecond do not swap places between two polls.
    (a, b) => b.receivedAt - a.receivedAt || a.id.localeCompare(b.id),
  );
}

/**
 * The cursor for the next poll: the highest `receivedAt` seen so far.
 *
 * Deliberately not the server's clock. Asking for everything after the newest
 * row we actually hold means a visit written between the query and the response
 * is delivered next time rather than skipped forever.
 */
export function nextSince(visits: readonly AdminVisit[]): number {
  let highest = 0;
  for (const visit of visits) {
    if (visit.receivedAt > highest) highest = visit.receivedAt;
  }
  return highest;
}

/** Ids the screen should mark as new — what this poll added, not what it held. */
export function arrivedIds(
  existing: readonly AdminVisit[],
  incoming: readonly AdminVisit[],
): string[] {
  const known = new Set(existing.map((visit) => visit.id));
  return incoming.filter((visit) => !known.has(visit.id)).map((visit) => visit.id);
}
