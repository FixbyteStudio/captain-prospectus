/**
 * The round: today's walking order and the agent's position, read once here
 * and shared by Tournée du jour and Carte (epic-117 context) — a screen that
 * re-derived `buildTodayList` on its own could number its pins or rows
 * differently from the other screen's, which is exactly the drift a shared
 * hook rules out.
 *
 * Extracted from `TodayScreen.tsx` verbatim: its own behaviour is unchanged,
 * this only moves the reading.
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Point } from "../../shared/geo";
import { fieldDb, type StoredVisit } from "./db";
import { buildTodayList, type TodayList } from "./today";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

export type RoundState = {
  list: TodayList;
  point: Point | null;
  /** True while a position reading is outstanding. */
  locating: boolean;
  /** Set once a reading has failed; the screen degrades rather than retries. */
  denied: boolean;
  /** Ask again — the agent has moved, or granted permission since. */
  refresh: () => void;
  /** The deliberately stale "now" the list was built with (see below);
   * Tournée's daily progress re-runs its own query on it. */
  now: number;
  /** The unaccepted visits the list's badges came from, for daily progress. */
  outboxVisits: StoredVisit[];
};

export function useRound(): RoundState {
  const { point, locating, denied, refresh } = useAgentPosition();
  const { lastSyncAt } = useSyncState();

  /**
   * "Now", for deciding which follow-ups are not due yet.
   *
   * Taken from the last successful sync rather than read during render, which
   * would be an impure call. It refreshes on every heartbeat, so the boundary
   * is at most 60 s stale — and the boundary is a local midnight, so that is
   * nowhere near enough to matter. The mount time covers the first render,
   * before any sync has landed.
   */
  const [openedAt] = useState(() => Date.now());
  const now = lastSyncAt ?? openedAt;

  const prospects = useLiveQuery(() => fieldDb.prospects.toArray(), [], []);
  const outbox = useLiveQuery(() => fieldDb.outboxProspects.toArray(), [], []);
  const outboxVisits = useLiveQuery(() => fieldDb.outboxVisits.toArray(), [], []);
  const queuedVisitProspectIds = useMemo(
    () => new Set(outboxVisits.map((v) => v.prospectId)),
    [outboxVisits],
  );

  // Recomputed when the position or any of the three tables changes. Cheap:
  // the round is tens of prospects, and orderByNearestNext is O(n²) on that.
  const list = buildTodayList(prospects, outbox, point, now, queuedVisitProspectIds);

  return { list, point, locating, denied, refresh, now, outboxVisits };
}
