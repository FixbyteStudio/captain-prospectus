# Architecture Decision Records

One decision per file, numbered, never edited after acceptance except to change status. To reverse a decision, write a new ADR that supersedes it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | accepted |
| [0002](0002-zero-cost-constraint.md) | Zero cost is a hard constraint | accepted |
| [0003](0003-single-cloudflare-worker.md) | Host everything on one Cloudflare Worker | accepted |
| [0004](0004-vite-react-pwa-not-nextjs.md) | Vite + React PWA, not Next.js | accepted |
| [0005](0005-d1-with-drizzle.md) | D1 with Drizzle ORM | accepted |
| [0006](0006-cloudflare-access-auth.md) | Cloudflare Access for authentication | accepted |
| [0007](0007-offline-first-insert-only-sync.md) | Offline-first, insert-only sync | accepted |
| [0008](0008-map-import-via-overpass.md) | Map import via OpenStreetMap Overpass | accepted |
| [0009](0009-no-pdf-import.md) | No PDF import in v1 | accepted |
| [0010](0010-live-feed-by-polling.md) | Live admin feed by polling | accepted |
| [0011](0011-server-derived-prospect-status.md) | Prospect status derived by the server | accepted |
| [0012](0012-workers-dev-hostname.md) | Use the workers.dev hostname | accepted |
| [0013](0013-frontend-conventions.md) | Frontend conventions — plain CSS, French UI, client state | accepted |

New ADR: copy [0000-template.md](0000-template.md), take the next number, open a PR.
