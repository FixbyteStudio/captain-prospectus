/**
 * Pins and the walking path for Carte — docs/design.md, "Carte" (spec-gh-121).
 *
 * Pure so the matrix rows are tested without a browser or Leaflet: `RoundMap`
 * only draws what this computes, and never re-derives the order or the
 * numbering itself. `now` is `TodayList.now`, the same array `TodayScreen`
 * renders — one source for the round, shared through `useRound`.
 */
import type { TodayItem } from "./today";

export type MapPin = {
  id: string;
  /** The stop's place in the walking order, 1-based — the same number its row
   * or card shows, even when a stop between it and the previous pin carries
   * no coordinates and so draws no pin of its own. */
  index: number;
  lat: number;
  lng: number;
  /** The next stop's pin is gold; every other pin is card-coloured. */
  next: boolean;
};

/**
 * One pin per stop that has coordinates, in walking order. A stop without
 * coordinates is skipped here — it still gets a number on its row, just not a
 * point to draw (spec-gh-121 matrix, "Stop without coordinates").
 */
export function mapPins(now: readonly TodayItem[]): MapPin[] {
  const pins: MapPin[] = [];
  now.forEach((item, i) => {
    if (item.lat === null || item.lng === null) return;
    pins.push({ id: item.id, index: i + 1, lat: item.lat, lng: item.lng, next: i === 0 });
  });
  return pins;
}

/**
 * The dashed line through the pins, stop to stop — never touching the agent's
 * own position (Design Notes: a straight segment from there would read as a
 * route, and ADR-0002 rules out a routing service that could draw a real one).
 */
export function walkingPath(pins: readonly MapPin[]): [number, number][] {
  return pins.map((pin) => [pin.lat, pin.lng]);
}
