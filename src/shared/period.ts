/**
 * The dashboard's periods — Europe/Brussels calendar days (GH #107).
 *
 * This file is the one home of the day boundary: the Worker counts with it and
 * the tests seed with it, so the two can never disagree about where "today"
 * starts. Pure: `Intl` only, no DOM, no Worker API.
 */

const ZONE = "Europe/Brussels";

/**
 * Module scope on purpose: building an `Intl.DateTimeFormat` costs far more CPU
 * than using one, and a request has 10 ms of it (INVARIANT 13).
 * `hourCycle: "h23"` so midnight reads 0, never 24.
 */
const brussels = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClock(epochMs: number): Wall {
  const wall: Wall = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const part of brussels.formatToParts(new Date(epochMs))) {
    if (part.type in wall) wall[part.type as keyof Wall] = Number(part.value);
  }
  return wall;
}

/** Brussels minus UTC at `epochMs`, in ms: 1 h in winter, 2 h in summer. */
function offsetAt(epochMs: number): number {
  const w = wallClock(epochMs);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - (epochMs - (epochMs % 1000));
}

/**
 * The instant Brussels reads 00:00 on that date. `day` may overflow either way;
 * `Date.UTC` normalises it.
 *
 * Two passes, because the offset to subtract is the one in force at the answer,
 * not at the guess. Brussels changes its clocks at 02:00/03:00, never at
 * midnight, so midnight always exists exactly once and the second pass is exact.
 */
function brusselsMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first);
}

export type Period = {
  /** Brussels midnight, `days − 1` days before today. Inclusive. */
  from: number;
  /** Brussels midnight tomorrow. Exclusive. */
  to: number;
  /** The start of the previous period, which runs `[previousFrom, from)`. */
  previousFrom: number;
};

/**
 * The last `days` Brussels calendar days, today included, and the `days` before
 * them. Built from calendar dates rather than `days × 24 h`, so a period that
 * crosses a clock change is 23 h or 25 h longer or shorter than that product
 * and still starts at midnight.
 */
export function brusselsPeriod(now: number, days: number): Period {
  const { year, month, day } = wallClock(now);
  return {
    from: brusselsMidnight(year, month, day - (days - 1)),
    to: brusselsMidnight(year, month, day + 1),
    previousFrom: brusselsMidnight(year, month, day - (2 * days - 1)),
  };
}

/**
 * (value − previous) ÷ previous, or `null` when there is nothing to compare
 * against — "—" on screen, never an infinite or made-up percentage
 * (docs/api.md › The dashboard).
 */
export function deltaOf(value: number, previous: number): number | null {
  return previous === 0 ? null : (value - previous) / previous;
}

/** A day in ms. Brussels days are not all this long, which is why `offsets` exists. */
export const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodOffsets = {
  /** Brussels minus UTC, in ms, from `from` until `changeAt`. */
  before: number;
  /** Brussels minus UTC, in ms, from `changeAt` on. Equals `before` when the clocks do not change. */
  after: number;
  /** The instant the clocks change inside `[from, to)`, or `to` when they do not. */
  changeAt: number;
};

/**
 * The Brussels offsets in force over `[from, to)`, so SQL can turn an instant
 * into a Brussels day number with one switch point instead of one bound
 * parameter per day (INVARIANT 7): `floor((t + offset(t)) / DAY_MS)`.
 *
 * At most one change: Brussels changes its clocks 5 to 7 months apart and a
 * period is at most 90 days. The change is found by bisection to the hour —
 * offsets are whole hours and change on the hour — so about a dozen `Intl`
 * calls, not one per day (INVARIANT 13).
 */
export function periodOffsets(from: number, to: number): PeriodOffsets {
  const before = offsetAt(from);
  const after = offsetAt(to - 1);
  if (before === after) return { before, after, changeAt: to };
  const HOUR = 60 * 60 * 1000;
  // Both bounds are Brussels midnights, hence whole UTC hours, and the clocks
  // never change at midnight, so offsetAt(to) is `after`. The loop keeps
  // offsetAt(lo) === before and offsetAt(hi) === after, both on the hour.
  let lo = from;
  let hi = to;
  while (hi - lo > HOUR) {
    const mid = lo + Math.floor((hi - lo) / 2 / HOUR) * HOUR;
    if (offsetAt(mid) === before) lo = mid;
    else hi = mid;
  }
  return { before, after, changeAt: hi };
}

/**
 * The Brussels calendar dates `YYYY-MM-DD` of the `days` days starting at
 * `from`, which is a Brussels midnight. One `Intl` call, then calendar
 * arithmetic — not one per day (INVARIANT 13).
 */
export function periodDates(from: number, days: number): string[] {
  const { year, month, day } = wallClock(from);
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.UTC(year, month - 1, day + i)).toISOString().slice(0, 10),
  );
}
