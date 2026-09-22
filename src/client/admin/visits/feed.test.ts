import { describe, expect, it } from "vitest";
import { arrivedIds, mergeVisits, nextSince } from "./feed";
import type { AdminVisit } from "../../../shared/schemas";

function visit(id: string, receivedAt: number): AdminVisit {
  return {
    id,
    prospectId: "00000000-0000-4000-8000-000000000000",
    prospectName: `Place ${id}`,
    agentEmail: "agent@example.com",
    visitedAt: receivedAt,
    receivedAt,
    flyerGiven: true,
    outcome: "interested",
    followUpAt: null,
    notes: null,
  };
}

describe("mergeVisits", () => {
  it("keeps the newest first", () => {
    const merged = mergeVisits([visit("a", 1)], [visit("b", 3), visit("c", 2)]);
    expect(merged.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("is idempotent, so a re-delivered visit never doubles", () => {
    const first = mergeVisits([], [visit("a", 1), visit("b", 2)]);
    const again = mergeVisits(first, [visit("b", 2)]);
    expect(again).toHaveLength(2);
    expect(again.map((v) => v.id)).toEqual(["b", "a"]);
  });

  it("breaks a same-millisecond tie the same way every time", () => {
    // Two phones syncing at once land on the same receivedAt. Without the
    // tie-break the two rows would swap places on every poll.
    const one = mergeVisits([], [visit("b", 5), visit("a", 5)]);
    const two = mergeVisits([visit("a", 5)], [visit("b", 5)]);
    expect(one.map((v) => v.id)).toEqual(two.map((v) => v.id));
  });

  it("returns what it was given when nothing arrived", () => {
    const held = [visit("a", 1)];
    expect(mergeVisits(held, [])).toBe(held);
  });
});

describe("nextSince", () => {
  it("is the highest receivedAt held, not the newest-first row", () => {
    expect(nextSince([visit("a", 3), visit("b", 9), visit("c", 1)])).toBe(9);
  });

  it("is 0 when nothing is held, which asks for everything", () => {
    expect(nextSince([])).toBe(0);
  });
});

describe("arrivedIds", () => {
  it("names only what this poll added", () => {
    expect(arrivedIds([visit("a", 1)], [visit("a", 1), visit("b", 2)])).toEqual(["b"]);
  });

  it("names nothing when the poll re-delivered what we had", () => {
    expect(arrivedIds([visit("a", 1)], [visit("a", 1)])).toEqual([]);
  });
});
