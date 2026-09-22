/**
 * When to sync next, and whether to keep going — docs/domains/field-operations.md.
 *
 * Split out of the hook that uses it so the rules can be tested without a
 * browser, a timer or a network. Every function here is pure.
 */
import { backoffDelayMs, SYNC_INTERVAL_MS, type SyncResult, type SyncStatus } from "./sync";

/**
 * A phone offline for a week holds more than one request's worth of outbox
 * (SYNC_VISITS_PER_REQUEST = 200), and field-operations.md asks the client to
 * "repeat until the outbox is empty".
 *
 * The cap is the backstop under `shouldDrain`'s progress rule: even a server
 * that accepts something every pass cannot hold the loop open indefinitely —
 * the sync-loop quota watch-out in docs/free-tier-budget.md. Six passes clears
 * 1200 visits, far past anything two agents produce in a week; whatever is left
 * waits for the next trigger, seconds later.
 */
export const MAX_DRAIN_PASSES = 6;

/**
 * Whether to immediately run another pass.
 *
 * Only after a *successful* pass that left work behind **and made progress**. A
 * failure backs off instead — retrying a 503 at once is how a quota gets burned.
 *
 * Progress is what makes the next pass different from this one. `runSync` takes
 * the first SYNC_VISITS_PER_REQUEST rows of the outbox, so a pass that accepted
 * nothing would build the identical payload again: the rows left are ones the
 * server will not take (an orphan visit — `docs/backlog/003`), not a slice it
 * has not been shown yet. Without this check the documented held-visit gap turns
 * every trigger into MAX_DRAIN_PASSES identical requests, for ever, which is the
 * sync-loop watch-out in docs/free-tier-budget.md arriving by a different door.
 */
export function shouldDrain(result: SyncResult, passesSoFar: number): boolean {
  if (result.status !== "ok") return false;
  if (result.remaining <= 0) return false;
  if (result.acceptedProspects + result.acceptedVisits <= 0) return false;
  return passesSoFar < MAX_DRAIN_PASSES;
}

/**
 * Delay before the next attempt.
 *
 * `ok` returns to the steady 60 s heartbeat. Everything else backs off
 * exponentially from 5 s to 5 min, including the states that will not fix
 * themselves: `auth` needs the agent to sign in again and `upgrade` needs a new
 * service worker, and in both cases polling faster changes nothing while the
 * outbox sits safely on disk.
 */
export function nextDelayMs(status: SyncStatus, consecutiveFailures: number): number {
  if (status === "ok") return SYNC_INTERVAL_MS;
  return backoffDelayMs(Math.max(1, consecutiveFailures));
}

/** A failure streak: reset by success, incremented by anything else. */
export function nextFailureCount(status: SyncStatus, consecutiveFailures: number): number {
  return status === "ok" ? 0 : consecutiveFailures + 1;
}

/**
 * Whether this status is worth putting in front of the agent.
 *
 * `ok` is not news. The rest each have a line in `copy.sync` that says what
 * happened and what to do about it.
 */
export function isWorthReporting(status: SyncStatus): boolean {
  return status !== "ok";
}
