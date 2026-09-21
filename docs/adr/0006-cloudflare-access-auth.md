# ADR-0006: Cloudflare Access for authentication

- Status: accepted
- Date: 2026-09-21

## Context
Three to four users total. Building login, password storage, reset flows and sessions is disproportionate and risky.

## Decision
We will put the whole hostname behind a Cloudflare Access self-hosted application with email one-time PIN. The Worker verifies the `Cf-Access-Jwt-Assertion` JWT against the team JWKS (issuer + audience) on every `/api` request. Role is derived from the `ADMIN_EMAILS` variable. No users table.

## Alternatives considered
| Option | Why not |
|---|---|
| Own auth (JWT + PBKDF2) | Code and attack surface for 4 users |
| Auth.js / better-auth | Session storage, email sending, more moving parts |
| Trust `Cf-Access-Authenticated-User-Email` header only | Spoofable if the Worker is ever reachable without Access |

## Consequences
- Adding a user = editing the Access policy (and `ADMIN_EMAILS` for admins).
- The client must handle an expired Access session while offline: sync uses `fetch(..., { redirect: "manual" })`, treats an opaque redirect or 401 as "sign in again", and never clears the outbox on auth failure.
- Local dev uses `DEV_USER_EMAIL`, honoured only on localhost.
- Free-plan seat limit of Cloudflare Zero Trust applies (verify on the pricing page; far above our needs).
