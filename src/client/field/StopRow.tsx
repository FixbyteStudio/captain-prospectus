/**
 * The compact row for everything after the next stop — docs/design.md,
 * "Next-stop card". Shared with Carte's list and the admin round view
 * (epic-117 context), which is why `expanded`/`onToggle` are parent-controlled
 * rather than local state: only `TodayScreen` decides "one row expanded at a
 * time" here.
 *
 * Tapping the header expands it in place to the same "Y aller"/"Visiter" pair
 * the next-stop card carries — no swipe (story 117.3) and no navigation on tap.
 */
import { Link } from "react-router";
import { ClipboardCheckIcon, NavigationIcon } from "lucide-react";
import { buttonVariants } from "@/ui/button-variants";
import { Badge } from "@/ui/badge";
import { copy, TYPE_LABELS } from "../copy";
import { formatDistance } from "../format";
import { cn } from "../lib/utils";
import { STATUS_EDGE } from "../admin/status";
import { StopNumber } from "./StopNumber";
import { navigationUrl, type TodayItem } from "./today";

/** A pending prospect has no server status to key an edge off yet. */
export function edgeFor(item: Pick<TodayItem, "status">): string {
  return item.status ? STATUS_EDGE[item.status] : STATUS_EDGE.new;
}

/** A known distance reads in ink at the caller's weight; an unknown one stays muted. */
export function Distance({
  item,
  className,
}: {
  item: Pick<TodayItem, "distanceM">;
  className?: string;
}) {
  if (item.distanceM === null) {
    return <span className="text-muted-foreground text-sm">{copy.today.distanceUnknown}</span>;
  }
  return <span className={cn("tnum", className)}>{formatDistance(item.distanceM)}</span>;
}

/**
 * "Pas encore envoyé": read-only knowledge of the outbox, never a reason to
 * hide or reorder a stop (invariants 2, 3; docs/design.md, "Next-stop card").
 * Shared by the card and every row so the two can never drift apart.
 */
export function NotSyncedBadge({ item }: { item: Pick<TodayItem, "pending" | "visitQueued"> }) {
  if (!item.pending && !item.visitQueued) return null;
  return (
    <Badge className="bg-tint-warn text-warn mt-1 rounded-sm border-transparent">
      {copy.today.notSynced}
    </Badge>
  );
}

/**
 * "Y aller" (secondary) and "Visiter" (primary), equal columns. Without
 * coordinates there is nowhere to send "Y aller", so "Visiter" alone takes the
 * full width rather than leaving an empty column.
 */
export function StopActions({
  item,
  className,
}: {
  item: Pick<TodayItem, "id" | "lat" | "lng" | "name">;
  className?: string;
}) {
  const url = navigationUrl(item);

  return (
    <div className={cn("grid gap-2.5", url ? "grid-cols-2" : "grid-cols-1", className)}>
      {url && (
        /* An external map, so it leaves the app rather than the round. */
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className={buttonVariants({ variant: "secondary", size: "touch" })}
        >
          <NavigationIcon aria-hidden="true" />
          {copy.today.navigate}
        </a>
      )}
      <Link to={`/tournee/${item.id}`} className={buttonVariants({ size: "touch" })}>
        <ClipboardCheckIcon aria-hidden="true" />
        {copy.today.visit}
      </Link>
    </div>
  );
}

export function StopRow({
  item,
  index,
  expanded,
  onToggle,
}: {
  item: TodayItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `stop-actions-${item.id}`;

  return (
    <li className="bg-card border-border overflow-hidden rounded-xl border">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          "flex min-h-16 w-full items-center gap-3 py-2.5 pr-3 pl-3.5 text-left",
          edgeFor(item),
        )}
      >
        <StopNumber index={index} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{item.name}</span>
          <span className="text-muted-foreground text-meta block truncate">
            {copy.today.meta(TYPE_LABELS[item.type], item.address)}
          </span>
          <NotSyncedBadge item={item} />
        </span>
        <span className="shrink-0 text-right">
          <Distance item={item} className="font-medium" />
        </span>
      </button>

      {/* Always rendered so `aria-controls` never points at a missing id;
          `hidden` keeps a collapsed row's actions out of the accessibility
          tree and the tab order. */}
      <div id={panelId} hidden={!expanded} className="border-border border-t px-3.5 py-3">
        <StopActions item={item} />
      </div>
    </li>
  );
}
