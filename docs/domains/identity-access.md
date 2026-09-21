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
