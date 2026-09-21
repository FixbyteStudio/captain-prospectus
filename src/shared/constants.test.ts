import { describe, expect, it } from "vitest";
import { OPEN_STATUSES, OUTCOMES, OUTCOME_TO_STATUS, STATUSES, isOpen } from "./constants";

/**
 * INVARIANT 3 lives in this table. It is the rule the whole product turns on:
 * get it wrong and prospects silently drop off, or never leave, an agent's list.
 * The expectations below are copied from docs/domains/prospecting.md.
 */
describe("OUTCOME_TO_STATUS", () => {
  it("matches the table in docs/domains/prospecting.md", () => {
    expect(OUTCOME_TO_STATUS).toEqual({
      no_contact: "follow_up",
      interested: "follow_up",
      not_interested: "rejected",
      follow_up: "follow_up",
      converted: "converted",
    });
  });

  it("maps every outcome to a real status", () => {
    for (const outcome of OUTCOMES) {
      expect(STATUSES).toContain(OUTCOME_TO_STATUS[outcome]);
    }
  });

  it("never produces `new` or `assigned` — those are admin-only transitions", () => {
    for (const outcome of OUTCOMES) {
      expect(["new", "assigned"]).not.toContain(OUTCOME_TO_STATUS[outcome]);
    }
  });
});

describe("open statuses", () => {
  it("puts new, assigned and follow_up on an agent's list, and nothing else", () => {
    expect([...OPEN_STATUSES]).toEqual(["new", "assigned", "follow_up"]);
    expect(isOpen("converted")).toBe(false);
    expect(isOpen("rejected")).toBe(false);
  });
});
