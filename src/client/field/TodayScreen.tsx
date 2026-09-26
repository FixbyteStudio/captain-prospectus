/**
 * The round — docs/design.md, "Next-stop card".
 *
 * The next stop gets a card, its own gold edge and both actions. Everything
 * after it is a quiet ledger that expands in place on tap — no swipe (story
 * 117.3) and no navigation on tap. Follow-ups not yet due sit in "Plus tard",
 * visible but not walkable from here.
 */
import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { copy } from "../copy";
import { formatDate } from "../format";
import { cn } from "../lib/utils";
import { fieldDb } from "./db";
import { NextStopCard } from "./NextStopCard";
import { edgeFor, StopRow } from "./StopRow";
import { buildTodayList, type TodayItem } from "./today";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

/** A follow-up not yet due. Visible and subordinate — it "can't be visited
 * from here" (EXPERIENCE.md), so it is a plain `<li>`, never a link or button. */
function LaterRow({ item }: { item: TodayItem }) {
  return (
    <li className={cn("bg-card border-border rounded-xl border px-3.5 py-2.5", edgeFor(item))}>
      <p className="text-base font-medium">{item.name}</p>
      {item.nextVisitAt !== null && (
        <p className="tnum text-warn text-sm">{copy.today.dueOn(formatDate(item.nextVisitAt))}</p>
      )}
    </li>
  );
}

/** "Plus tard": follow-ups not yet due, heading plus their rows. Used both in
 * the two-column layout and when there is no next stop to split around. */
function LaterSection({ items }: { items: readonly TodayItem[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{copy.today.later}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <LaterRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

/**
 * What the visit form and the add-prospect form left in the router state.
 *
 * Both replace their history entry with this screen, so there is nowhere else
 * to confirm a save: without this, an agent taps « Enregistrer la visite » and
 * lands back on the round with no sign anything happened.
 */
type RoundState = { saved?: boolean; added?: boolean };

export function TodayScreen() {
  const { point, locating, denied, refresh } = useAgentPosition();
  const { lastSyncAt } = useSyncState();
  const { state } = useLocation();
  const justSaved = (state as RoundState | null) ?? null;

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
  const [next, ...rest] = list.now;

  // One row expanded at a time (CAP-6): expanding row 3 collapses row 2.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = (id: string) => setExpandedId((current) => (current === id ? null : id));

  return (
    <section>
      <header>
        <h2 className="text-title">{copy.today.title}</h2>
        {list.now.length > 0 && (
          <p className="tnum text-muted-foreground text-base">
            {copy.today.remaining(list.now.length)}
          </p>
        )}
      </header>

      {justSaved?.saved && (
        <p role="status" className="text-success mt-2 text-sm">
          {copy.visit.saved}
        </p>
      )}
      {justSaved?.added && (
        <p role="status" className="text-success mt-2 text-sm">
          {copy.fieldProspect.saved}
        </p>
      )}

      {locating && <p className="text-muted-foreground mt-1 text-sm">{copy.today.locating}</p>}
      {denied && (
        <p className="text-muted-foreground mt-1 text-sm">
          {copy.today.positionDenied}{" "}
          <button type="button" onClick={refresh} className="text-foreground underline">
            {copy.today.retryPosition}
          </button>
        </p>
      )}

      {!next && list.later.length === 0 ? (
        <p className="text-muted-foreground mt-4">{copy.today.empty}</p>
      ) : next ? (
        <div className="mt-4 md:grid md:grid-cols-5 md:gap-6">
          {/* DOM order keeps the card first; from 768px only its grid
              placement moves it to the right. self-start, or the stretched
              grid item is as tall as the list and sticky never engages. */}
          <div className="md:sticky md:top-4 md:col-span-3 md:col-start-3 md:row-start-1 md:self-start">
            <NextStopCard item={next} />
          </div>

          {(rest.length > 0 || list.later.length > 0) && (
            <div className="mt-4 space-y-4 md:col-span-2 md:col-start-1 md:row-start-1 md:mt-0">
              {rest.length > 0 && (
                <ul className="space-y-2">
                  {rest.map((item, i) => (
                    <StopRow
                      key={item.id}
                      item={item}
                      index={i + 2}
                      expanded={expandedId === item.id}
                      onToggle={() => toggle(item.id)}
                    />
                  ))}
                </ul>
              )}

              {list.later.length > 0 && <LaterSection items={list.later} />}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <LaterSection items={list.later} />
        </div>
      )}
    </section>
  );
}
