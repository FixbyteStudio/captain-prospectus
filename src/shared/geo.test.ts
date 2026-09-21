import { describe, expect, it } from "vitest";
import { distanceMeters, orderByNearestNext } from "./geo";

describe("distanceMeters", () => {
  it("measures a known distance", () => {
    // Paris Notre-Dame to the Louvre, about 2 km.
    const d = distanceMeters({ lat: 48.853, lng: 2.3499 }, { lat: 48.8606, lng: 2.3376 });
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1600);
  });

  it("is zero for the same point", () => {
    expect(distanceMeters({ lat: 48.85, lng: 2.35 }, { lat: 48.85, lng: 2.35 })).toBe(0);
  });
});

describe("orderByNearestNext", () => {
  const here = { lat: 0, lng: 0 };

  it("walks to the closest prospect, then the closest from there", () => {
    const items = [
      { id: "far", lat: 0.05, lng: 0 },
      { id: "near", lat: 0.001, lng: 0 },
      { id: "middle", lat: 0.01, lng: 0 },
    ];
    expect(orderByNearestNext(items, here).map((i) => i.id)).toEqual(["near", "middle", "far"]);
  });

  it("puts prospects without coordinates last, in their original order", () => {
    const items = [
      { id: "nowhere1", lat: null, lng: null },
      { id: "somewhere", lat: 0.001, lng: 0 },
      { id: "nowhere2", lat: null, lng: null },
    ];
    expect(orderByNearestNext(items, here).map((i) => i.id)).toEqual([
      "somewhere",
      "nowhere1",
      "nowhere2",
    ]);
  });

  it("keeps every prospect", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, lat: i * 0.01, lng: 0 }));
    expect(orderByNearestNext(items, here)).toHaveLength(20);
  });
});
