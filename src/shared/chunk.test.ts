import { describe, expect, it } from "vitest";
import { D1_MAX_BOUND_PARAMS } from "./constants";
import { chunk } from "./chunk";

/** INVARIANT 7: D1 rejects a statement binding more than 100 parameters. */
describe("chunk", () => {
  it("keeps every batch under D1's parameter limit", () => {
    for (const columns of [1, 3, 14, 15, 33, 50, 100]) {
      const rows = Array.from({ length: 250 }, (_, i) => i);
      for (const batch of chunk(rows, columns)) {
        expect(batch.length * columns).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMS);
        expect(batch.length).toBeGreaterThan(0);
      }
    }
  });

  it("loses no rows and keeps their order", () => {
    const rows = Array.from({ length: 97 }, (_, i) => i);
    expect(chunk(rows, 15).flat()).toEqual(rows);
  });

  it("returns nothing for no rows", () => {
    expect(chunk([], 15)).toEqual([]);
  });

  it("refuses a row that cannot fit in a statement at all", () => {
    expect(() => chunk([1], 101)).toThrow();
    expect(() => chunk([1], 0)).toThrow();
  });
});
