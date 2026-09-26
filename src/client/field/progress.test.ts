import { describe, expect, it } from "vitest";
import { dailyProgress } from "./progress";
import { brusselsPeriod } from "../../shared/period";
import type { SentVisit, StoredVisit } from "./db";

const IDENTITY = "a@example.com";
const NOW = 1_700_000_000_000;
const PERIOD = brusselsPeriod(NOW, 1);

const visit = (over: Partial<StoredVisit> = {}): StoredVisit => ({
  id: crypto.randomUUID(),
  prospectId: crypto.randomUUID(),
  visitedAt: NOW,
  lat: null,
  lng: null,
  flyerGiven: true,
  outcome: "interested",
  followUpAt: null,
  notes: null,
  scriptId: null,
  answers: {},
  writtenBy: IDENTITY,
  ...over,
});

const logged = (over: Partial<SentVisit> = {}): SentVisit => ({
  id: crypto.randomUUID(),
  prospectId: crypto.randomUUID(),
  sentAt: NOW,
  writtenBy: IDENTITY,
  ...over,
});

describe("dailyProgress", () => {
  it("counts the union of the log and the pending outbox once each, by visit id (matrix: union, not sum)", () => {
    const shared = visit();
    const other = visit();
    const result = dailyProgress({
      logged: [logged({ id: shared.id, prospectId: shared.prospectId }), logged()],
      outboxVisits: [shared, other],
      identity: IDENTITY,
      stops: [],
      period: PERIOD,
    });

    // Three rows total, but `shared` appears on both sides — 3 distinct ids.
    expect(result.n).toBe(3);
  });

  it("counts a pre-v4 outbox row with no log entry from the outbox alone (matrix: pre-v4 outbox row)", () => {
    const unstamped: StoredVisit = { ...visit(), writtenBy: undefined };
    const result = dailyProgress({
      logged: [],
      outboxVisits: [unstamped],
      identity: IDENTITY,
      stops: [],
      period: PERIOD,
    });

    expect(result.n).toBe(1);
  });

  it("counts nothing the day after, when the log arrives already empty (matrix: next day)", () => {
    const result = dailyProgress({
      logged: [],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [],
      period: PERIOD,
    });

    expect(result.n).toBe(0);
    expect(result.total).toBe(0);
  });

  it("does not count an outbox row visited before today's Brussels boundary — an unsent visit from yesterday must not read as today's", () => {
    const stale = visit({ visitedAt: PERIOD.from - 1 });
    const result = dailyProgress({
      logged: [],
      outboxVisits: [stale],
      identity: IDENTITY,
      stops: [{ id: stale.prospectId }],
      period: PERIOD,
    });

    expect(result.n).toBe(0);
    // The stop is still on the round; only the count is unaffected.
    expect(result.total).toBe(1);
  });

  it("does not count another agent's stamped row on a shared phone (matrix + triage row 2: other agent's row)", () => {
    const theirs = logged({ writtenBy: "b@example.com" });
    const result = dailyProgress({
      logged: [theirs],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [{ id: theirs.prospectId }],
      period: PERIOD,
    });

    expect(result.n).toBe(0);
    // The stop is still on the round; nothing of theirs excluded it.
    expect(result.total).toBe(1);
  });

  it("does not count another agent's pending outbox row either", () => {
    const theirs = visit({ writtenBy: "b@example.com" });
    const result = dailyProgress({
      logged: [],
      outboxVisits: [theirs],
      identity: IDENTITY,
      stops: [],
      period: PERIOD,
    });

    expect(result.n).toBe(0);
  });

  it("leaves the denominator unchanged when a logged visit's stop is still on the round (triage row 1: overlap)", () => {
    const v = visit();
    const result = dailyProgress({
      logged: [logged({ id: v.id, prospectId: v.prospectId })],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [{ id: v.prospectId }],
      period: PERIOD,
    });

    expect(result.n).toBe(1);
    // Without exclusion this would be 2 (1 + the one stop) — the round
    // deliberately keeps a visited stop on the list (invariant 3).
    expect(result.total).toBe(1);
  });

  it("grows the denominator only for stops whose visit is not yet counted", () => {
    const v = visit();
    const untouchedStopId = crypto.randomUUID();
    const result = dailyProgress({
      logged: [logged({ id: v.id, prospectId: v.prospectId })],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [{ id: v.prospectId }, { id: untouchedStopId }],
      period: PERIOD,
    });

    expect(result.n).toBe(1);
    expect(result.total).toBe(2);
  });

  it("does not grow the denominator for a second visit to the same stop on the same day", () => {
    const prospectId = crypto.randomUUID();
    const first = logged({ prospectId });
    const second = logged({ prospectId });
    const result = dailyProgress({
      logged: [first, second],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [{ id: prospectId }],
      period: PERIOD,
    });

    // Two distinct visits raise n, but there is still only one stop.
    expect(result.n).toBe(2);
    expect(result.total).toBe(1);
  });

  it("holds the denominator at the round's size when a counted visit's stop has since left `stops`", () => {
    const v = visit();
    const result = dailyProgress({
      logged: [logged({ id: v.id, prospectId: v.prospectId })],
      outboxVisits: [],
      identity: IDENTITY,
      // The prospect moved to "Plus tard" (or the pull removed it): it is no
      // longer in `stops`, but it must still hold its place in the total.
      stops: [],
      period: PERIOD,
    });

    expect(result.n).toBe(1);
    expect(result.total).toBe(1);
  });

  it("renders as an empty round when there are no stops and nothing logged (matrix: empty round)", () => {
    const result = dailyProgress({
      logged: [],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [],
      period: PERIOD,
    });

    expect(result).toEqual({ n: 0, total: 0, percent: 0 });
  });

  it("rounds the percentage and never divides by zero", () => {
    const a = visit();
    const b = visit();
    const untouchedStopId = crypto.randomUUID();
    const result = dailyProgress({
      logged: [
        logged({ id: a.id, prospectId: a.prospectId }),
        logged({ id: b.id, prospectId: b.prospectId }),
      ],
      outboxVisits: [],
      identity: IDENTITY,
      stops: [{ id: a.prospectId }, { id: b.prospectId }, { id: untouchedStopId }],
      period: PERIOD,
    });

    expect(result).toEqual({ n: 2, total: 3, percent: 67 });
  });
});
