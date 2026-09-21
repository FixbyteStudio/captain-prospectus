# ADR-0003: Host everything on one Cloudflare Worker

- Status: accepted
- Date: 2026-09-21

## Context
We need static hosting, an API and a database at zero cost. Netlify was considered first; Netlify Functions are ephemeral, so SQLite on disk is not an option and the database would be a separate vendor.

## Decision
We will deploy one Cloudflare Worker that serves the Vite build through Workers Static Assets (`not_found_handling: single-page-application`) and handles `/api/*` with Hono (`run_worker_first: ["/api/*"]`). D1 is bound to the same Worker.

## Alternatives considered
| Option | Why not |
|---|---|
| Netlify + Turso / Neon | Two vendors; Neon free tier suspends when idle (cold start) |
| Cloudflare Pages + Pages Functions | Workers Static Assets is Cloudflare's current path; one config, one deploy |
| Separate API Worker + Pages site | Two deploys, CORS, no benefit at this size |

## Consequences
- Same origin: no CORS, cookies and Access session shared.
- One `wrangler deploy`.
- Runtime is workerd, not Node: some npm packages won't work (`nodejs_compat` helps). Check before adding a dependency.
