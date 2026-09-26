---
id: 013
status: needs-decision
implements: docs/domains/identity-access.md#offline-and-session-expiry, docs/security.md#threat-model "Agent reading other agents' data"
depends_on: [005]
---

# Do not stamp or sync under a cached identity the Access cookie may not match

## Goal

`runSync` and the outbox stamp (`writtenBy`, backlog 005) use an identity that
is known to match the Access session the next request will carry, never one
read from the offline cache alone.

## Why this is not ready

Found by the security review of backlog 005. `SyncProvider` receives
`me.email`, and `resolveIdentity` (`src/client/field/identity.ts`) falls back to
the cached identity on any `/api/me` failure other than a 401. So if agent B
signs in through Access on agent A's phone and that launch's `/api/me` hits a
network blip or a 5xx, the shell runs as A while the cookie is B's: the next
sync sends A's held rows under B's JWT (the Worker files them under B), and
B's new visits are stamped A. Backlog 005 closes the common case (a live
`/api/me` that names the new agent); this window stays open. Closing it needs a
choice no ADR or domain doc makes.

## Options

| Option | Trade-off |
|---|---|
| **A. Treat a cached identity as unconfirmed.** While `offline` is true, queue new rows as today but sync nothing stamped; re-run `/api/me` on the first sync trigger and pass the live answer to `SyncProvider`. | Client-only, no contract change. Costs one extra `/api/me` per offline start, and a phone that starts offline syncs nothing until `/api/me` answers — a new state the sync strip must name |
| **B. Echo the JWT email in the sync response** (additive field). The client compares it before trusting `accepted` and holds rows back on a mismatch. | Authoritative, since it is the same request that files the rows — but it only notices *after* the rows were sent under the wrong name. Needs a pre-flight to prevent rather than detect, and it is a sync-contract change |
| **C. Accept the window.** Document it as residual in identity-access.md. | No code. The window needs a device changing hands **and** a failed `/api/me` on that exact launch |

## Out of scope

Anything backlog 005 already did: the stamp, the v3 upgrade, the partition in
`runSync`.
