import { describe, expect, it } from "vitest";
import { uuidSchema } from "../shared/schemas";
import { brusselsPeriod } from "../shared/period";
import { FIXED_STORIES, seedHistory, seedId, type SeedSubject } from "./dev-seed-history";

/** The seed generator is pure; these pin what the route relies on (GH #108). */

const AGENT = "agent@example.com";

function subject(overrides?: Partial<SeedSubject>): SeedSubject {
  return {
    id: seedId("prospect:test"),
    dedupeKey: "geo:le-bistrot:50.850:4.350",
    assignedTo: AGENT,
    lat: 50.85,
    lng: 4.35,
    story: null,
    ...overrides,
  };
}

/** A walk that draws visits, whatever the weights: the first key with some. */
function walkerKey(now: number): string {
  for (let i = 0; i < 100; i++) {
    const key = `geo:walker-${i}:50.850:4.350`;
    if (seedHistory(subject({ dedupeKey: key }), now).length >= 2) return key;
  }
  throw new Error("no walk drew two visits in 100 keys");
}

/** Brussels wall time → epoch ms, via the one home of the day boundary. */
function brussels(date: string, hour: number): number {
  // Noon UTC is the same Brussels date in every season.
  const today = brusselsPeriod(Date.parse(`${date}T12:00:00Z`), 1).from;
  return today + hour * 3_600_000;
}

/** [start, end) of the Brussels day `k` days before `now`, from brusselsPeriod alone. */
function dayBounds(now: number, k: number): [number, number] {
  const start = brusselsPeriod(now, k + 1).from;
  const end = k === 0 ? brusselsPeriod(now, 1).to : brusselsPeriod(now, k).from;
  return [start, end];
}

describe("seedId", () => {
  it("is stable, distinct per label, and a UUID the wire contract accepts", () => {
    expect(seedId("a")).toBe(seedId("a"));
    expect(seedId("a")).not.toBe(seedId("b"));
    for (const label of ["a", "orphan:not_assigned", "geo:chez-lea:50.857:4.359:3"]) {
      expect(uuidSchema.safeParse(seedId(label)).success).toBe(true);
    }
  });
});

describe("seedHistory", () => {
  const now = brussels("2026-09-26", 15);

  it("is deterministic: the same key gives the same rows and ids", () => {
    const key = walkerKey(now);
    const first = seedHistory(subject({ dedupeKey: key }), now);
    expect(seedHistory(subject({ dedupeKey: key }), now)).toEqual(first);
    // A later run keeps the ids, so a re-seed inserts nothing.
    const later = seedHistory(subject({ dedupeKey: key }), now + 3 * 86_400_000);
    expect(later.map((v) => v.id)).toEqual(first.map((v) => v.id));
  });

  it("gives visits to the assignee only, and none to an unassigned prospect", () => {
    expect(seedHistory(subject({ assignedTo: null, story: 0 }), now)).toEqual([]);
    for (let i = 0; i < 50; i++) {
      const rows = seedHistory(subject({ dedupeKey: `geo:p-${i}:50.850:4.350` }), now);
      for (const row of rows) expect(row.agentEmail).toBe(AGENT);
    }
  });

  it("never dates a visit after now, even at 06:00", () => {
    const early = brussels("2026-09-26", 6);
    for (let i = 0; i < 200; i++) {
      const rows = seedHistory(subject({ dedupeKey: `geo:p-${i}:50.850:4.350` }), early);
      for (const row of rows) {
        expect(row.visitedAt).toBeLessThanOrEqual(early);
        expect(row.receivedAt).toBeLessThanOrEqual(early);
        expect(row.receivedAt).toBeGreaterThanOrEqual(row.visitedAt);
      }
    }
    // Today's visits, planned for 08:00–19:00, are clamped to now rather than dropped.
    const clamped = Array.from({ length: 200 }, (_, i) =>
      seedHistory(subject({ dedupeKey: `geo:p-${i}:50.850:4.350` }), early),
    )
      .flat()
      .filter((v) => v.visitedAt >= brusselsPeriod(early, 1).from);
    expect(clamped.length).toBeGreaterThan(0);
    for (const row of clamped) expect(row.visitedAt).toBe(early);
  });

  it("stays inside the last 180 days", () => {
    const [oldest] = dayBounds(now, 179);
    for (let i = 0; i < 200; i++) {
      for (const row of seedHistory(subject({ dedupeKey: `geo:p-${i}:50.850:4.350` }), now)) {
        expect(row.visitedAt).toBeGreaterThanOrEqual(oldest);
      }
    }
  });

  // Last Sunday of March and of October 2026: a 23 h and a 25 h day.
  it.each([
    ["an ordinary week", brussels("2026-09-26", 15)],
    ["the week the clocks go forward", brussels("2026-03-31", 15)],
    ["the week the clocks go back", brussels("2026-10-27", 15)],
    ["early morning after the clocks go back", brussels("2026-10-26", 6)],
  ])("lands each fixed story on its Brussels day in %s", (_, at) => {
    FIXED_STORIES.forEach((steps, story) => {
      const rows = seedHistory(subject({ story }), at);
      expect(rows).toHaveLength(steps.length);
      steps.forEach((step, n) => {
        const row = rows[n];
        const [start, end] = dayBounds(at, step.k);
        expect(row?.outcome).toBe(step.outcome);
        expect(row?.visitedAt).toBeGreaterThanOrEqual(start);
        expect(row?.visitedAt).toBeLessThan(end);
        if (step.followUpK === undefined) {
          expect(row?.followUpAt).toBeNull();
        } else if (step.followUpK >= 0) {
          const [dueStart, dueEnd] = dayBounds(at, step.followUpK);
          expect(row?.followUpAt).toBeGreaterThanOrEqual(dueStart);
          expect(row?.followUpAt).toBeLessThan(dueEnd);
        } else {
          // Ahead of today: the period ending on the due day starts today.
          const aheadDays = -step.followUpK;
          const due = row?.followUpAt ?? 0;
          expect(due).toBeGreaterThan(brusselsPeriod(at, 1).to);
          expect(brusselsPeriod(due, aheadDays + 1).from).toBe(brusselsPeriod(at, 1).from);
        }
      });
    });
  });

  /**
   * The frozen decision in the #108 spec: ~300 places average 10–15 visits a
   * day over 180 days, about 5 % of them conversions, like the mockup.
   */
  it("averages 10–15 visits a day over 180 days for 270 prospects", () => {
    const rows = Array.from({ length: 270 }, (_, i) =>
      seedHistory(
        subject({
          id: seedId(`prospect:synthetic-${i}`),
          dedupeKey: `geo:${["brasserie", "cafe", "friterie"][i % 3]}-${i}:${(50.87 + (i % 18) * 0.0012).toFixed(3)}:${(4.34 + Math.floor(i / 18) * 0.0016).toFixed(3)}`,
          assignedTo: i % 2 === 0 ? AGENT : "admin@example.com",
        }),
        now,
      ),
    ).flat();
    const perDay = rows.length / 180;
    expect(perDay).toBeGreaterThanOrEqual(10);
    expect(perDay).toBeLessThanOrEqual(15);
    const convertedShare = rows.filter((v) => v.outcome === "converted").length / rows.length;
    expect(convertedShare).toBeGreaterThan(0.03);
    expect(convertedShare).toBeLessThan(0.07);
  });

  it("sets a follow-up on the outcomes that call for one, and only those", () => {
    for (let i = 0; i < 200; i++) {
      for (const row of seedHistory(subject({ dedupeKey: `geo:p-${i}:50.850:4.350` }), now)) {
        const wantsOne = ["no_contact", "interested", "follow_up"].includes(row.outcome);
        expect(row.followUpAt !== null).toBe(wantsOne);
      }
    }
  });
});
