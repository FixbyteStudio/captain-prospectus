import { describe, expect, it } from "vitest";
import {
  CIRCLE_DEFAULT_RADIUS_M,
  addVertex,
  clampRadius,
  clickCircle,
  edgePoint,
  isFull,
  isSearchable,
  isSearchableCircle,
  moveCircleHandle,
  moveVertex,
  radiusBetween,
  removeLastVertex,
  type Circle,
  type Vertex,
} from "./map";
import {
  PLACES_RADIUS_MAX_M,
  PLACES_RADIUS_MIN_M,
  POLYGON_MAX_VERTICES,
  POLYGON_MIN_VERTICES,
} from "../../../shared/constants";

const A: Vertex = [45.764, 4.8357];
const B: Vertex = [45.765, 4.84];
const C: Vertex = [45.762, 4.839];

describe("addVertex", () => {
  it("appends without mutating the polygon it was given", () => {
    const start: Vertex[] = [A];
    const next = addVertex(start, B);
    expect(next).toEqual([A, B]);
    expect(start).toEqual([A]);
  });

  it("refuses to grow past the Overpass cap", () => {
    const full: Vertex[] = Array.from({ length: POLYGON_MAX_VERTICES }, () => A);
    expect(addVertex(full, B)).toHaveLength(POLYGON_MAX_VERTICES);
  });
});

describe("moveVertex", () => {
  it("replaces one vertex and leaves the rest", () => {
    expect(moveVertex([A, B, C], 1, [1, 2])).toEqual([A, [1, 2], C]);
  });

  it("ignores an index that is not there, rather than growing the array", () => {
    expect(moveVertex([A, B], 7, [1, 2])).toEqual([A, B]);
    expect(moveVertex([A, B], -1, [1, 2])).toEqual([A, B]);
  });
});

describe("removeLastVertex", () => {
  it("undoes the most recent click", () => {
    expect(removeLastVertex([A, B, C])).toEqual([A, B]);
  });

  it("is a no-op on an empty polygon", () => {
    expect(removeLastVertex([])).toEqual([]);
  });
});

describe("isSearchable", () => {
  it("needs the three vertices an area needs", () => {
    expect(isSearchable([A, B])).toBe(false);
    expect(isSearchable([A, B, C])).toBe(true);
    expect(POLYGON_MIN_VERTICES).toBe(3);
  });

  it("matches the cap the Worker validates against, so the button never 400s", () => {
    const full: Vertex[] = Array.from({ length: POLYGON_MAX_VERTICES }, () => A);
    expect(isSearchable(full)).toBe(true);
    expect(isSearchable([...full, B])).toBe(false);
    expect(isFull(full)).toBe(true);
  });
});

/* ------------------------------------------------------------------ circles */

const CIRCLE: Circle = { center: A, radius: 300 };

describe("clickCircle", () => {
  it("places a visible circle on the first click, not a lone pin", () => {
    // A centre with no circle looks like a map that swallowed the click.
    expect(clickCircle(null, A)).toEqual({ center: A, radius: CIRCLE_DEFAULT_RADIUS_M });
  });

  it("sets the radius from the second click, keeping the centre", () => {
    const next = clickCircle({ center: A, radius: CIRCLE_DEFAULT_RADIUS_M }, B);
    expect(next.center).toEqual(A);
    expect(next.radius).toBe(radiusBetween(A, B));
  });
});

describe("moveCircleHandle", () => {
  it("moves the whole circle by its centre handle, radius unchanged", () => {
    expect(moveCircleHandle(CIRCLE, 0, B)).toEqual({ center: B, radius: 300 });
  });

  it("resizes by the edge handle, centre unchanged", () => {
    const resized = moveCircleHandle(CIRCLE, 1, B);
    expect(resized.center).toEqual(A);
    expect(resized.radius).toBe(radiusBetween(A, B));
  });

  it("ignores a handle index it does not know", () => {
    expect(moveCircleHandle(CIRCLE, 7, B)).toEqual(CIRCLE);
  });
});

describe("clampRadius", () => {
  it("holds the radius inside what the route will accept", () => {
    // Past these the Worker answers 400, so the drag stops at the edge rather
    // than letting the admin draw something that cannot be searched.
    expect(clampRadius(1)).toBe(PLACES_RADIUS_MIN_M);
    expect(clampRadius(99_999)).toBe(PLACES_RADIUS_MAX_M);
    expect(clampRadius(300.6)).toBe(301);
  });
});

describe("edgePoint", () => {
  it("sits due east of the centre, at the radius", () => {
    const edge = edgePoint(CIRCLE);
    expect(edge[0]).toBe(CIRCLE.center[0]);
    expect(edge[1]).toBeGreaterThan(CIRCLE.center[1]);
    // Round-trips through the same great circle the today list orders by.
    expect(radiusBetween(CIRCLE.center, edge)).toBeCloseTo(CIRCLE.radius, -1);
  });
});

describe("isSearchableCircle", () => {
  it("needs a circle at all", () => {
    expect(isSearchableCircle(null)).toBe(false);
  });

  it("accepts one inside the range and rejects one outside it", () => {
    expect(isSearchableCircle(CIRCLE)).toBe(true);
    expect(isSearchableCircle({ center: A, radius: PLACES_RADIUS_MIN_M - 1 })).toBe(false);
    expect(isSearchableCircle({ center: A, radius: PLACES_RADIUS_MAX_M + 1 })).toBe(false);
  });
});
