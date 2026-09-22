/**
 * What the today list shows and in what order — docs/domains/field-operations.md.
 *
 *   - every prospect assigned to the agent with an open status;
 *   - greedy nearest-next from the phone's position, uncoordinated ones last;
 *   - future `follow_up`s held back in a separate "later" group.
 *
 * Pure, so the rules are tested without a browser or a Dexie instance.
 */
import { distanceMeters, orderByNearestNext, type Point } from "../../shared/geo";
import type { FieldProspect, Prospect } from "../../shared/schemas";

/**
 * A prospect the agent added on the ground that the server has not accepted
 * yet. It is on the list — an agent who adds a food truck must be able to visit
 * it immediately, offline, without waiting for a sync that may be hours away.
 *
 * `pending` is what the row uses to say so, and what stops the screen
 * pretending the server knows about it.
 */
export type TodayItem = {
  id: string;
  name: string;
  type: Prospect["type"];
  lat: number | null;
  lng: number | null;
  address: string | null;
  status: Prospect["status"] | null;
  nextVisitAt: number | null;
  pending: boolean;
  /** Metres from the agent, or null when either end has no position. */
  distanceM: number | null;
};

export type TodayList = {
  /** Walk these, in this order. */
  now: TodayItem[];
  /** Follow-ups not due yet. Visible, subordinate, not in the walking order. */
  later: TodayItem[];
};

function fromProspect(p: Prospect): TodayItem {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    lat: p.lat,
    lng: p.lng,
    address: p.address,
    status: p.status,
    nextVisitAt: p.nextVisitAt,
    pending: false,
    distanceM: null,
  };
}

function fromOutbox(p: FieldProspect): TodayItem {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    address: p.address ?? null,
    // No server-derived status exists for a prospect the server has not seen.
    // INVARIANT 3: the client does not invent one.
    status: null,
    nextVisitAt: null,
    pending: true,
    distanceM: null,
  };
}

/** A follow-up whose next visit is still in the future is not due today. */
function isLater(item: TodayItem, now: number): boolean {
  return item.status === "follow_up" && item.nextVisitAt !== null && item.nextVisitAt > now;
}

function withDistance(items: TodayItem[], from: Point | null): TodayItem[] {
  if (!from) return items;
  return items.map((item) =>
    item.lat === null || item.lng === null
      ? item
      : { ...item, distanceM: distanceMeters(from, { lat: item.lat, lng: item.lng }) },
  );
}

/**
 * Build the list.
 *
 * `outbox` rows are deduplicated against `prospects` by id, because a sync that
 * has already been accepted leaves the row in both for the moment between the
 * server's response and the outbox delete.
 */
export function buildTodayList(
  prospects: readonly Prospect[],
  outbox: readonly FieldProspect[],
  from: Point | null,
  now: number,
): TodayList {
  const known = new Set(prospects.map((p) => p.id));
  const items = [
    ...prospects.map(fromProspect),
    ...outbox.filter((p) => !known.has(p.id)).map(fromOutbox),
  ];

  const due: TodayItem[] = [];
  const later: TodayItem[] = [];
  for (const item of items) (isLater(item, now) ? later : due).push(item);

  const ordered = from ? orderByNearestNext(due, from) : due;

  return {
    now: withDistance(ordered, from),
    // The later group is sorted by when it comes due, not by distance: the
    // question it answers is "when", not "which door next".
    later: withDistance(
      later.sort((a, b) => (a.nextVisitAt ?? 0) - (b.nextVisitAt ?? 0)),
      from,
    ),
  };
}

/**
 * A link that shows the agent where the door is.
 *
 * OpenStreetMap rather than a `geo:` URI: `geo:` is an Android intent that iOS
 * Safari ignores entirely, so it would silently do nothing on half the phones
 * in use. An https link opens in whatever the agent has, and keeps the round on
 * OSM data, which is the source the map import uses too (ADR-0008).
 */
export function navigationUrl(item: Pick<TodayItem, "lat" | "lng" | "name">): string | null {
  if (item.lat === null || item.lng === null) return null;
  const lat = item.lat.toFixed(6);
  const lng = item.lng.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`;
}
