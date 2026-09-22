# Security & privacy

## Threat model (short)
| Threat | Mitigation |
|---|---|
| Access bypass (Worker reached without Access) | JWT verified in the Worker; preview URLs disabled or protected |
| Header spoofing | Email taken from the verified JWT only |
| Dev impersonation leaking to prod | `DEV_USER_EMAIL` ignored unless host is localhost |
| Agent reading other agents' data | Agent routes filter by the verified email |
| Malformed or oversized payloads | zod validation, array size caps, body size limits |
| SQL injection | Drizzle parameterised queries only; no string-built SQL |
| XSS through imported data (names, notes) | React escaping; no `dangerouslySetInnerHTML` |
| Stolen phone | Access session expiry; admin removes the email from the Access policy |
| Leaked Cloudflare token | Scoped token in GitHub secrets, never in the repo |

## Personal data
- **Prospect data** is mostly public business info, but may include a contact person's name or phone. Keep it to what the business needs.
- **Agent location** is personal data. One reading (`getCurrentPosition`, never `watchPosition`) is written to the visit at check-in and to a field prospect when it is added — that reading is what reaches the server and is stored. The today list also takes a reading to order the round by distance; that one stays in memory for the ordering only and is never persisted or sent. Neither case tracks in the background. Agents are told this.
- **Retention**: define before go-live how long visit notes and positions are kept.
- Data stays in the Cloudflare account; no third-party analytics.

## Secrets
- No secrets in `wrangler.jsonc` beyond non-sensitive vars. If a real secret is ever needed: `wrangler secret put`.
- `.dev.vars` is git-ignored.
