import { describe, expect, it } from "vitest";
import type { SyncResult, SyncStatus } from "./sync";
import { SYNC_INTERVAL_MS } from "./sync";
import {
  MAX_DRAIN_PASSES,
  isWorthReporting,
  nextDelayMs,
  nextFailureCount,
  shouldDrain,
} from "./sync-schedule";

/**
 * field-operations.md asks the client to repeat until the outbox is empty, and
 * free-tier-budget.md names a stuck sync loop as the one realistic way this app
 * burns its request quota. Both of those live in this file's rules.
 */

const result = (over: Partial<SyncResult> = {}): SyncResult => ({
  status: "ok",
  acceptedProspects: 0,
  acceptedVisits: 0,
  remaining: 0,
  ...over,
});

const FAILURES: readonly SyncStatus[] = ["offline", "auth", "upgrade", "error"];

describe("shouldDrain", () => {
  it("goes again when a successful pass left work behind", () => {
    expect(shouldDrain(result({ remaining: 40 }), 1)).toBe(true);
  });

  it("stops once the outbox is empty", () => {
    expect(shouldDrain(result({ remaining: 0 }), 1)).toBe(false);
  });

  it.each(FAILURES)("never drains after %s, however much is left", (status) => {
    // Retrying a failure immediately is the quota bug, not the fix.
    expect(shouldDrain(result({ status, remaining: 500 }), 1)).toBe(false);
  });

  it("caps the passes so a server that accepts nothing cannot spin", () => {
    // The pathological case: every pass succeeds and nothing ever drains.
    expect(shouldDrain(result({ remaining: 200 }), MAX_DRAIN_PASSES - 1)).toBe(true);
    expect(shouldDrain(result({ remaining: 200 }), MAX_DRAIN_PASSES)).toBe(false);
  });
});

describe("nextDelayMs", () => {
  it("returns to the 60 s heartbeat after a success", () => {
    expect(nextDelayMs("ok", 0)).toBe(SYNC_INTERVAL_MS);
    // A past failure streak does not slow down a run that has since succeeded.
    expect(nextDelayMs("ok", 5)).toBe(SYNC_INTERVAL_MS);
  });

  it.each(FAILURES)("backs off after %s", (status) => {
    expect(nextDelayMs(status, 1)).toBe(5_000);
    expect(nextDelayMs(status, 2)).toBe(10_000);
  });

  it("treats a first failure as one failure even if the caller says zero", () => {
    // Guards against a caller that increments after scheduling: a 0 would
    // otherwise mean "retry immediately", which is the hot loop.
    expect(nextDelayMs("error", 0)).toBe(5_000);
  });

  it("stops growing at five minutes", () => {
    expect(nextDelayMs("error", 20)).toBe(5 * 60_000);
  });
});

describe("nextFailureCount", () => {
  it("resets on success and climbs otherwise", () => {
    expect(nextFailureCount("ok", 7)).toBe(0);
    expect(nextFailureCount("offline", 2)).toBe(3);
  });
});

describe("isWorthReporting", () => {
  it("stays quiet when a sync worked", () => {
    expect(isWorthReporting("ok")).toBe(false);
  });

  it.each(FAILURES)("surfaces %s, which has a line in copy.sync", (status) => {
    expect(isWorthReporting(status)).toBe(true);
  });
});
