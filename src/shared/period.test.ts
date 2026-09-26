import { describe, expect, it } from "vitest";
import { brusselsPeriod, deltaOf } from "./period";

const at = (iso: string) => Date.parse(iso);
const HOUR = 60 * 60 * 1000;

/** What a Brussels wall clock shows at `epochMs`, to check a bound is midnight. */
const wall = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

describe("brusselsPeriod", () => {
  describe("the day boundary is Brussels midnight (I/O matrix, boundary)", () => {
    it("in winter (UTC+1), on both sides of midnight", () => {
      // 00:00 on 15 January in Brussels is 23:00 UTC the day before.
      expect(brusselsPeriod(at("2026-01-14T23:00:00.000Z"), 1)).toEqual({
        from: at("2026-01-14T23:00:00.000Z"),
        to: at("2026-01-15T23:00:00.000Z"),
        previousFrom: at("2026-01-13T23:00:00.000Z"),
      });
      // One millisecond earlier it is still the 14th.
      expect(brusselsPeriod(at("2026-01-14T22:59:59.999Z"), 1)).toEqual({
        from: at("2026-01-13T23:00:00.000Z"),
        to: at("2026-01-14T23:00:00.000Z"),
        previousFrom: at("2026-01-12T23:00:00.000Z"),
      });
    });

    it("in summer (UTC+2), on both sides of midnight", () => {
      expect(brusselsPeriod(at("2026-07-14T22:00:00.000Z"), 1).from).toBe(
        at("2026-07-14T22:00:00.000Z"),
      );
      expect(brusselsPeriod(at("2026-07-14T21:59:59.999Z"), 1).from).toBe(
        at("2026-07-13T22:00:00.000Z"),
      );
    });
  });

  it("runs N days, today included, and the previous period is the N before", () => {
    expect(brusselsPeriod(at("2026-01-15T12:00:00.000Z"), 7)).toEqual({
      from: at("2026-01-08T23:00:00.000Z"), // 9 January, 00:00
      to: at("2026-01-15T23:00:00.000Z"), // 16 January, 00:00
      previousFrom: at("2026-01-01T23:00:00.000Z"), // 2 January, 00:00
    });
  });

  it("crosses a year and a clock change for 30 and 90 days", () => {
    const now = at("2026-01-15T12:00:00.000Z");
    expect(brusselsPeriod(now, 30).from).toBe(at("2025-12-16T23:00:00.000Z"));
    // 18 October 2025 was still summer time.
    expect(brusselsPeriod(now, 90).from).toBe(at("2025-10-17T22:00:00.000Z"));
    expect(brusselsPeriod(now, 90).previousFrom).toBe(at("2025-07-19T22:00:00.000Z"));
  });

  describe("daylight saving (I/O matrix, DST)", () => {
    it("the week after 29 March 2026 is 7 × 24 h − 1 h", () => {
      const period = brusselsPeriod(at("2026-04-02T10:00:00.000Z"), 7);
      expect(period.from).toBe(at("2026-03-26T23:00:00.000Z")); // 27 March, UTC+1
      expect(period.to).toBe(at("2026-04-02T22:00:00.000Z")); // 3 April, UTC+2
      expect(period.to - period.from).toBe(7 * 24 * HOUR - HOUR);
      expect(period.previousFrom).toBe(at("2026-03-19T23:00:00.000Z"));
    });

    it("the week after 25 October 2026 is 7 × 24 h + 1 h", () => {
      const period = brusselsPeriod(at("2026-10-28T10:00:00.000Z"), 7);
      expect(period.from).toBe(at("2026-10-21T22:00:00.000Z")); // 22 October, UTC+2
      expect(period.to).toBe(at("2026-10-28T23:00:00.000Z")); // 29 October, UTC+1
      expect(period.to - period.from).toBe(7 * 24 * HOUR + HOUR);
    });

    it("the changeover days themselves are 23 h and 25 h", () => {
      const spring = brusselsPeriod(at("2026-03-29T12:00:00.000Z"), 1);
      expect(spring.to - spring.from).toBe(23 * HOUR);
      const autumn = brusselsPeriod(at("2026-10-25T12:00:00.000Z"), 1);
      expect(autumn.to - autumn.from).toBe(25 * HOUR);
    });
  });

  it("every bound is exactly 00:00:00 in Brussels, all year round", () => {
    const start = at("2026-01-01T00:00:00.000Z");
    // Every 7 h 13 min for a year: lands at every hour of the day in both offsets.
    for (let now = start; now < start + 366 * 24 * HOUR; now += 7 * HOUR + 13 * 60 * 1000) {
      for (const days of [7, 30, 90]) {
        const { from, to, previousFrom } = brusselsPeriod(now, days);
        for (const bound of [from, to, previousFrom]) {
          expect(wall.format(new Date(bound))).toBe("00:00:00");
        }
        expect(from).toBeLessThanOrEqual(now);
        expect(now).toBeLessThan(to);
      }
    }
  });
});

describe("deltaOf", () => {
  it("is null when the previous period is 0 (I/O matrix, previous empty)", () => {
    expect(deltaOf(5, 0)).toBeNull();
    expect(deltaOf(0, 0)).toBeNull();
  });

  it("is 0 when flat", () => {
    expect(deltaOf(8, 8)).toBe(0);
  });

  it("is a signed ratio of the previous period", () => {
    expect(deltaOf(15, 10)).toBe(0.5);
    expect(deltaOf(5, 10)).toBe(-0.5);
    expect(deltaOf(0, 4)).toBe(-1);
  });
});
