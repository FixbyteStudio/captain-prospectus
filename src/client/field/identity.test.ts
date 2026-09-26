import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { copy } from "../copy";
import { adminAccess, resolveIdentity } from "./identity";

/**
 * The security review that named this file's reason for existing: the first
 * version of this logic treated a 401 the same as a network failure, which
 * would let a phone whose Access session was revoked keep opening the round
 * from its cache — the exact "stolen phone" mitigation in docs/security.md.
 * Every case here is a way that could go wrong again.
 */

const AGENT_A = { email: "a@example.com", role: "agent" as const };
const AGENT_B = { email: "b@example.com", role: "agent" as const };

describe("a successful /api/me", () => {
  it("is ready, online, with no switch when nothing was cached", () => {
    const outcome = resolveIdentity({ ok: true, body: AGENT_A }, null);
    expect(outcome).toEqual({
      kind: "ready",
      identity: AGENT_A,
      offline: false,
      identitySwitched: false,
    });
  });

  it("is not a switch when the cached identity is the same", () => {
    const outcome = resolveIdentity({ ok: true, body: AGENT_A }, AGENT_A);
    expect(outcome.kind === "ready" && outcome.identitySwitched).toBe(false);
  });

  it("flags a switch when a different email was cached", () => {
    const outcome = resolveIdentity({ ok: true, body: AGENT_B }, AGENT_A);
    expect(outcome).toEqual({
      kind: "ready",
      identity: AGENT_B,
      offline: false,
      identitySwitched: true,
    });
  });

  it("is not a switch when the cache is present but unparseable", () => {
    // A corrupt or foreign-shaped cache value must not be read as "a
    // different agent" — that would clear a round for no real reason.
    const outcome = resolveIdentity({ ok: true, body: AGENT_A }, { junk: true });
    expect(outcome.kind === "ready" && outcome.identitySwitched).toBe(false);
  });

  it("refuses a response that does not match meResponseSchema", () => {
    const outcome = resolveIdentity({ ok: true, body: { email: "not-an-email" } }, null);
    expect(outcome).toEqual({ kind: "error", message: copy.errors.generic, revoked: false });
  });
});

describe("a 401 — the session is invalid, not merely unreachable", () => {
  it("never falls back to the cache, even with a valid one sitting there", () => {
    const error = new ApiError(401, "auth", "Votre session a expiré. Reconnectez-vous.");
    const outcome = resolveIdentity({ ok: false, error }, AGENT_A);
    expect(outcome).toEqual({ kind: "error", message: error.message, revoked: true });
  });

  it("tells the caller to delete the cache, not merely to ignore it", () => {
    // Refusing the fallback is not enough on its own: the cache survives, and
    // the same phone in airplane mode takes the offline branch below, where
    // there is no 401 to refuse. `revoked` is what closes that door.
    const error = new ApiError(401, "auth", "Votre session a expiré. Reconnectez-vous.");
    const revoked = resolveIdentity({ ok: false, error }, AGENT_A);
    expect(revoked.kind === "error" && revoked.revoked).toBe(true);

    const stillCached = resolveIdentity(
      { ok: false, error: new TypeError("Failed to fetch") },
      AGENT_A,
    );
    expect(stillCached.kind).toBe("ready");
  });
});

describe("any other ApiError (the Worker answered, but not about identity)", () => {
  it("falls back to a valid cache, same as a network failure would", () => {
    const error = new ApiError(500, "misconfigured", "Access is not configured on this Worker.");
    const outcome = resolveIdentity({ ok: false, error }, AGENT_A);
    expect(outcome).toEqual({
      kind: "ready",
      identity: AGENT_A,
      offline: true,
      identitySwitched: false,
    });
  });

  it("does not revoke the cache, because it says nothing about this identity", () => {
    const error = new ApiError(500, "misconfigured", "Access is not configured on this Worker.");
    const outcome = resolveIdentity({ ok: false, error }, null);
    expect(outcome).toEqual({
      kind: "error",
      message: copy.errors.offlineFirstRun,
      revoked: false,
    });
  });
});

describe("a genuine network failure (fetch itself threw)", () => {
  it("falls back to a valid cache and marks the result offline", () => {
    const outcome = resolveIdentity(
      { ok: false, error: new TypeError("Failed to fetch") },
      AGENT_A,
    );
    expect(outcome).toEqual({
      kind: "ready",
      identity: AGENT_A,
      offline: true,
      identitySwitched: false,
    });
  });

  it("errors with the first-run message when nothing is cached", () => {
    const outcome = resolveIdentity({ ok: false, error: new TypeError("Failed to fetch") }, null);
    expect(outcome).toEqual({
      kind: "error",
      message: copy.errors.offlineFirstRun,
      revoked: false,
    });
  });

  it("errors the same way when the cache exists but fails to parse", () => {
    const outcome = resolveIdentity(
      { ok: false, error: new TypeError("Failed to fetch") },
      { email: "not-an-email" },
    );
    expect(outcome).toEqual({
      kind: "error",
      message: copy.errors.offlineFirstRun,
      revoked: false,
    });
  });

  it("treats a plain thrown string the same as any other non-ApiError failure", () => {
    const outcome = resolveIdentity({ ok: false, error: "some string" }, AGENT_A);
    expect(outcome.kind).toBe("ready");
  });
});

describe("adminAccess (spec-gh-115)", () => {
  // The full role × fromCache × online matrix. Deleting `&& online` or
  // `&& !fromCache` from `entry`/`screens` must fail one of these.
  it("an online, server-confirmed admin gets both gates", () => {
    expect(adminAccess({ role: "admin", fromCache: false, online: true })).toEqual({
      screens: true,
      entry: true,
    });
  });

  it("an offline, server-confirmed admin keeps the screens but loses the tab", () => {
    // `screens` never reads `online` — an admin already on /admin keeps the
    // route when the network drops (#97 owns what that screen then says).
    expect(adminAccess({ role: "admin", fromCache: false, online: false })).toEqual({
      screens: true,
      entry: false,
    });
  });

  it("a cache-started admin gets neither gate, online or not", () => {
    // Deleting `&& !fromCache` from `screens` would open the admin routes to
    // a cached identity the server never confirmed this session — invariant 10.
    expect(adminAccess({ role: "admin", fromCache: true, online: true })).toEqual({
      screens: false,
      entry: false,
    });
    expect(adminAccess({ role: "admin", fromCache: true, online: false })).toEqual({
      screens: false,
      entry: false,
    });
  });

  it("an agent never gets either gate, online or not, cached or not", () => {
    expect(adminAccess({ role: "agent", fromCache: false, online: true })).toEqual({
      screens: false,
      entry: false,
    });
    expect(adminAccess({ role: "agent", fromCache: true, online: false })).toEqual({
      screens: false,
      entry: false,
    });
  });

  it("entry never opens wider than screens: deleting `&& online` would show a tab with no working screen behind it", () => {
    const { screens, entry } = adminAccess({ role: "admin", fromCache: false, online: false });
    expect(entry).toBe(false);
    expect(screens).toBe(true);
  });
});
