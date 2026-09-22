/**
 * The round — docs/design.md, "The next stop is the screen".
 *
 * Nearest-next ordering means the first item is not a row, it is an
 * instruction. It gets the width, the space and the actions; the rest of the
 * round is a quiet ledger beneath it.
 */
import { Link } from "react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { buttonVariants } from "@/ui/button-variants";
import { copy, TYPE_LABELS } from "../copy";
import { formatDate, formatDistance } from "../format";
import { cn } from "../lib/utils";
import { STATUS_EDGE } from "../admin/status";
import { fieldDb } from "./db";
import { buildTodayList, navigationUrl, type TodayItem } from "./today";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

/** The leading edge. A pending prospect has no server status to show yet. */
function edgeFor(item: TodayItem): string {
  return item.status ? STATUS_EDGE[item.status] : STATUS_EDGE.new;
}

function Distance({ item }: { item: TodayItem }) {
  if (item.distanceM === null) {
    return <span className="text-muted-foreground text-sm">{copy.today.distanceUnknown}</span>;
  }
  return (
    <span className="tnum text-muted-foreground text-sm">{formatDistance(item.distanceM)}</span>
  );
}

/** The stop the agent is walking to now. */
function NextStop({ item, index }: { item: TodayItem; index: number }) {
  const url = navigationUrl(item);

  // No card, no shadow, no radius: design.md's "Not this" rejects boxes around
  // rows, and the field section says the next stop is set apart by space and by
  // being the only thing carrying actions.
  return (
    <article className={cn("border-border border-b py-5 pr-4 pl-5", edgeFor(item))}>
      <div className="flex items-baseline gap-3">
        <span className="tnum text-muted-foreground shrink-0 text-sm">{index}</span>
        <h3 className="text-display flex-1 font-semibold">{item.name}</h3>
      </div>

      <div className="mt-1 pl-8">
        <p className="text-muted-foreground text-sm">{TYPE_LABELS[item.type]}</p>
        {item.address && <p className="text-muted-foreground text-sm">{item.address}</p>}
        {item.pending && <p className="text-warn mt-1 text-sm">{copy.today.notSynced}</p>}
        <p className="mt-2">
          <Distance item={item} />
        </p>
      </div>

      <div className="mt-4 flex gap-2 pl-8">
        {url && (
          /* An external map, so it leaves the app rather than the round. */
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(buttonVariants({ variant: "outline", size: "touch" }), "flex-1")}
          >
            {copy.today.navigate}
          </a>
        )}
        <Link
          to={`/tournee/${item.id}`}
          className={cn(buttonVariants({ size: "touch" }), "flex-1")}
        >
          {copy.today.visit}
        </Link>
      </div>
    </article>
  );
}

/** Everything after the next one. Compact, tappable, no actions of its own. */
function StopRow({ item, index }: { item: TodayItem; index?: number }) {
  return (
    <li>
      <Link
        to={`/tournee/${item.id}`}
        className={cn(
          "hover:bg-secondary flex min-h-touch items-center gap-3 rounded-md py-2 pr-3 pl-4",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
          edgeFor(item),
        )}
      >
        {index !== undefined && (
          <span className="tnum text-muted-foreground w-5 shrink-0 text-sm">{index}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="text-muted-foreground block truncate text-sm">
            {TYPE_LABELS[item.type]}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {item.nextVisitAt !== null && index === undefined ? (
            <span className="text-muted-foreground text-sm">{formatDate(item.nextVisitAt)}</span>
          ) : (
            <Distance item={item} />
          )}
        </span>
      </Link>
    </li>
  );
}

export function TodayScreen() {
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

  // Recomputed when the position or either table changes. Cheap: the round is
  // tens of prospects, and orderByNearestNext is O(n²) on that.
  const list = buildTodayList(prospects, outbox, point, now);
  const [next, ...rest] = list.now;

  return (
    <section>
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.today.title}</h2>
        {list.now.length > 0 && (
          <span className="tnum text-muted-foreground text-sm">
            {copy.today.remaining(list.now.length)}
          </span>
        )}
      </header>

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
      ) : (
        <>
          {next && (
            <div className="mt-4">
              <NextStop item={next} index={1} />
            </div>
          )}

          {rest.length > 0 && (
            <ul className="mt-2 space-y-1">
              {rest.map((item, i) => (
                <StopRow key={item.id} item={item} index={i + 2} />
              ))}
            </ul>
          )}

          {list.later.length > 0 && (
            <>
              <h3 className="text-muted-foreground mt-8 text-sm font-medium">{copy.today.later}</h3>
              <ul className="mt-2 space-y-1">
                {list.later.map((item) => (
                  <StopRow key={item.id} item={item} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <div className="mt-8">
        <Link
          to="/tournee/nouveau"
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}
        >
          {copy.today.addProspect}
        </Link>
      </div>
    </section>
  );
}
