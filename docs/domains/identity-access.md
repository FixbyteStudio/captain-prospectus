# Identity & access

See [ADR-0006](../adr/0006-cloudflare-access-auth.md).

- Login is handled by **Cloudflare Access** (email one-time PIN) in front of the Worker.
- The Worker **verifies** the `Cf-Access-Jwt-Assertion` JWT (signature via the team's JWKS, issuer, audience). The email header alone is never trusted.
- Identity = verified email, lowercased.
- Role: `admin` if the email is in `ADMIN_EMAILS`, otherwise `agent`. The Access policy decides who is allowed in at all.

## Permissions
| Action | Agent | Admin |
|---|---|---|
| Sync own list, log visits, add field prospects | ✓ | ✓ |
| Read visit history of a prospect | own assigned | all |
| Import, edit, assign prospects | | ✓ |
| Edit scripts | | ✓ |
| Live visit feed | | ✓ |

## Local development
`DEV_USER_EMAIL` in `.dev.vars` impersonates a user. It is honoured **only** when the request host is `localhost` or `127.0.0.1`.

## Offline and session expiry
Access sessions expire. The app shell is cached by the service worker, so the agent can keep working offline. When a sync gets a 401 or an Access redirect, the app shows "Sign in again to sync" and keeps the outbox intact.

**The app shell itself has the same offline fallback, with the same limit.**
On load it calls `GET /api/me`; if that genuinely cannot be reached (no network
route to the Worker at all), it falls back to the last identity Dexie cached
and opens the field screens from what the phone already has. It does **not**
fall back on a 401 — that is the Worker answering that the session is no
longer valid, which is different from being unreachable, and is exactly the
"stolen phone" mitigation in [security.md](../security.md) (an admin removes
the email from the Access policy; the next `/api/me` the phone manages to send
comes back 401, not cached-and-accepted). A 401 clears the identity error path
and asks the agent to sign in again, same as a sync 401 always has.

The cached identity is a rendering convenience, never proof: the Worker
re-derives identity from the verified JWT on every request regardless of what
the client claims to be. Its only other effect is that if the identity that
comes back from a successful `/api/me` names a **different** email than the
cached one — a different agent has signed in on this device — the locally
cached round (`prospects`) and cached visit history are cleared before
anything renders, so one agent never sees another's list from cache. The
outbox is never cleared this way (INVARIANT 5); a queued visit written under
the previous identity and synced under the new one is a known, tracked gap
(`docs/backlog/005-outbox-identity-stamp.md`).
