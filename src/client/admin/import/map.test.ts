import { describe, expect, it } from "vitest";
import { addVertex, isFull, isSearchable, moveVertex, removeLastVertex, type Vertex } from "./map";
import { POLYGON_MAX_VERTICES, POLYGON_MIN_VERTICES } from "../../../shared/constants";

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
