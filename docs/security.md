# Security & privacy

## Threat model (short)

Reviewed in full at M5 (see the roadmap). A row that the code does not honour says so
and links the issue; a row with no caveat was checked and holds. **Keep it that way** —
a mitigation nobody has verified is worse than one nobody claimed.

| Threat | Mitigation |
|---|---|
| Access bypass (Worker reached without Access) | JWT verified in the Worker (`src/worker/auth.ts`), fail-closed when Access is misconfigured. **Preview URLs are a manual dashboard step with no repo-side control** — [#38](https://github.com/FixbyteStudio/captain-prospectus/issues/38) |
| Header spoofing | Email taken from the verified JWT only |
| Dev impersonation leaking to prod | `DEV_USER_EMAIL` ignored unless host is localhost; `/api/dev/*` needs both that variable and a localhost host, and it is the one route mounted before auth |
| Agent reading other agents' data | Agent **reads** filter by the verified email. A **write** is still accepted against any prospect that exists — INVARIANT 5 outranks the rule — but only the assignee's visit derives status, so an outsider's visit changes nothing anyone acts on ([ADR-0021](adr/0021-visits-derive-status-only-for-the-assignee.md), [#33](https://github.com/FixbyteStudio/captain-prospectus/issues/33)) |
| Malformed or oversized payloads | zod validation, array size caps, and a `MAX_REQUEST_BYTES` body cap enforced Worker-wide in `src/worker/index.ts` before anything parses the body |
| SQL injection | Drizzle parameterised queries only; no string-built SQL |
| XSS through imported data (names, notes) | React escaping; no `dangerouslySetInnerHTML` |
| Stolen phone | Access session expiry; admin removes the email from the Access policy, and the next `/api/me` clears the cached round. **Only at mount**, so a resumed PWA keeps it — [#35](https://github.com/FixbyteStudio/captain-prospectus/issues/35) |
| Leaked Cloudflare token | Scoped token in GitHub secrets, never in the repo |

### The body cap

`MAX_REQUEST_BYTES` (`src/shared/constants.ts`) is 2 MiB, about twice the largest
request a client can legitimately build — a full sync of 100 field prospects and 200
visits carrying maximum-length notes and a 50-question script answered is 1060 KiB.
It exists because the array caps bound rows, not bytes: `answersSchema` does not limit
how many answers a visit carries, so a schema-valid payload can reach 19.7 MiB.

It is enforced as the **first** middleware registered, above the `/dev` mount, because
Hono composes handlers in registration order and `/api/dev/*` is the one route mounted
before auth. Budget tests in `src/shared/constants.test.ts` fail if a count cap is ever
raised past the byte cap, and `src/client/field/sync.ts` trims a batch that would exceed
it — a payload the server always refuses is an outbox that never drains (INVARIANT 5).

## Personal data
- **Prospect data** is mostly public business info, but may include a contact person's name or phone. Keep it to what the business needs.
- **Agent location** is personal data. One reading (`getCurrentPosition`, never `watchPosition`) is written to the visit at check-in and to a field prospect when it is added — that reading is what reaches the server and is stored. The today list also takes a reading to order the round by distance; that one stays in memory for the ordering only and is never persisted or sent. Neither case tracks in the background. Agents are told this.
- **Retention**: a visit is kept for ever; its **position and notes are nulled after
  90 days** (`RETENTION_DAYS`), measured on `received_at` because a phone's clock can be
  wrong. A daily Cron Trigger runs the sweep
  ([ADR-0023](adr/0023-retention-by-redaction.md), `src/worker/retention.ts`). The fact of
  a visit is business history; where the agent was standing is not. A consequence worth
  knowing: a visit older than 90 days can no longer be checked against where it was made.
- No third-party analytics, and the data stays in the Cloudflare account. Backups go to R2, not to a GitHub artifact (ADR-0023, [#34](https://github.com/FixbyteStudio/captain-prospectus/issues/34)); the bucket is one-time setup in [deployment.md](deployment.md).

## Secrets
- No secrets in `wrangler.jsonc` beyond non-sensitive vars. If a real secret is ever needed: `wrangler secret put`.
- **`GOOGLE_PLACES_KEY`** is the one real secret (ADR-0020). It is set with
  `wrangler secret put GOOGLE_PLACES_KEY`, lives in `.dev.vars` locally, and appears in
  neither `wrangler.jsonc` nor the repo — `config.test.ts` fails CI if it ever does.
  The browser never sees it: the key is a request header the Worker adds, which is why
  the map import is a Worker route and not a client call. Google's own error bodies are
  never forwarded to the admin, because a 400 from a bad field mask echoes back the
  request those headers were on.
- `.dev.vars` is git-ignored.
