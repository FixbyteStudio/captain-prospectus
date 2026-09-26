import { describe, expect, it } from "vitest";
import type { TodayItem } from "./today";
import { mapPins, walkingPath } from "./round-map";

const item = (over: Partial<TodayItem> = {}): TodayItem => ({
  id: crypto.randomUUID(),
  name: "Le Bouchon",
  type: "restaurant",
  lat: 50.8467,
  lng: 4.3525,
  address: null,
  status: "assigned",
  nextVisitAt: null,
  pending: false,
  distanceM: null,
  visitQueued: false,
  ...over,
});

describe("mapPins", () => {
  it("numbers every stop with coordinates in walking order, gold for the first", () => {
    const a = item({ lat: 50.85, lng: 4.35 });
    const b = item({ lat: 50.86, lng: 4.36 });
    const c = item({ lat: 50.87, lng: 4.37 });

    expect(mapPins([a, b, c])).toEqual([
      { id: a.id, index: 1, lat: 50.85, lng: 4.35, next: true },
      { id: b.id, index: 2, lat: 50.86, lng: 4.36, next: false },
      { id: c.id, index: 3, lat: 50.87, lng: 4.37, next: false },
    ]);
  });

  it("skips a stop with no coordinates but keeps the numbering around it", () => {
    const a = item({ lat: 50.85, lng: 4.35 });
    const noCoords = item({ lat: null, lng: null });
    const c = item({ lat: 50.87, lng: 4.37 });

    expect(mapPins([a, noCoords, c])).toEqual([
      { id: a.id, index: 1, lat: 50.85, lng: 4.35, next: true },
      { id: c.id, index: 3, lat: 50.87, lng: 4.37, next: false },
    ]);
  });

  it("draws no pin at all for an empty round (a Plus tard list belongs elsewhere)", () => {
    expect(mapPins([])).toEqual([]);
  });
});

describe("walkingPath", () => {
  it("joins the pins in order, never the agent's own position", () => {
    const pins = mapPins([item({ lat: 1, lng: 2 }), item({ lat: 3, lng: 4 })]);
    expect(walkingPath(pins)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("skips straight from 1 to 3 when 2 has no coordinates", () => {
    const pins = mapPins([
      item({ lat: 1, lng: 2 }),
      item({ lat: null, lng: null }),
      item({ lat: 5, lng: 6 }),
    ]);
    expect(walkingPath(pins)).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  it("is empty when there are no pins to join", () => {
    expect(walkingPath([])).toEqual([]);
  });
});
