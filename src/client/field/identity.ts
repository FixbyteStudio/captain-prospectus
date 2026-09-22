/**
 * What the app shell does with `/api/me` — pulled out of `App.tsx` so the
 * branches are testable without a DOM.
 *
 * A security review of the first version of this logic (M2) found it treated
 * a 401 — the Worker saying a session is no longer valid — the same as a
 * network failure, which would let a revoked phone keep opening the round
 * from its cache forever. Every branch below exists because of a specific
 * failure mode; see the comment on each.
 */
import { ApiError } from "../api";
import { meResponseSchema, type MeResponse } from "../../shared/schemas";
import { copy } from "../copy";

export type IdentityFetchResult = { ok: true; body: unknown } | { ok: false; error: unknown };

export type IdentityOutcome =
  | {
      kind: "ready";
      identity: MeResponse;
      /** True when this came from the cache, not from `/api/me` answering. */
      offline: boolean;
      /** True when a *different* email than the cached one just signed in. */
      identitySwitched: boolean;
    }
  | { kind: "error"; message: string };

/**
 * Decide what to show, given how `/api/me` went and what (if anything) is
 * cached. Both `body` and `cached` are untrusted input parsed here, the same
 * rule `sync.ts` follows for the sync response: never act on a payload that
 * does not match the shared contract.
 */
export function resolveIdentity(result: IdentityFetchResult, cached: unknown): IdentityOutcome {
  if (result.ok) {
    const parsed = meResponseSchema.safeParse(result.body);
    if (!parsed.success) return { kind: "error", message: copy.errors.generic };

    const identity = parsed.data;
    const cachedParsed = cached ? meResponseSchema.safeParse(cached) : null;
    const identitySwitched =
      cachedParsed?.success === true && cachedParsed.data.email !== identity.email;

    return { kind: "ready", identity, offline: false, identitySwitched };
  }

  // A 401 is the Worker having been reached and having answered "this
  // session is no longer valid" — `requireIdentity` in src/worker/auth.ts
  // returns it when the Access token is missing or fails to verify. That is
  // exactly the "stolen phone" mitigation in docs/security.md (an admin
  // removes the email from the Access policy); falling back to the cache here
  // would erase that mitigation. Any other ApiError (a 500 from a
  // misconfigured Worker, say) is not a statement about *this* identity, so
  // it falls through to the cache like a genuine network failure would.
  if (result.error instanceof ApiError && result.error.status === 401) {
    return { kind: "error", message: result.error.message };
  }

  const cachedParsed = cached ? meResponseSchema.safeParse(cached) : null;
  if (cachedParsed?.success) {
    return { kind: "ready", identity: cachedParsed.data, offline: true, identitySwitched: false };
  }
  // Nothing usable cached: this phone has never reached the server, so there
  // is no round to show and no identity to assume.
  return { kind: "error", message: copy.errors.offlineFirstRun };
}
