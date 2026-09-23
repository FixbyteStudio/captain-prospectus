# Architecture Decision Records

One decision per file, numbered, never edited after acceptance except to change status. To reverse a decision, write a new ADR that supersedes it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | accepted |
| [0002](0002-zero-cost-constraint.md) | Zero cost is a hard constraint | accepted — amended by 0020 |
| [0003](0003-single-cloudflare-worker.md) | Host everything on one Cloudflare Worker | accepted |
| [0004](0004-vite-react-pwa-not-nextjs.md) | Vite + React PWA, not Next.js | accepted |
| [0005](0005-d1-with-drizzle.md) | D1 with Drizzle ORM | accepted |
| [0006](0006-cloudflare-access-auth.md) | Cloudflare Access for authentication | accepted |
| [0007](0007-offline-first-insert-only-sync.md) | Offline-first, insert-only sync | accepted |
| [0008](0008-map-import-via-overpass.md) | Map import via OpenStreetMap Overpass | accepted — amended by 0020 |
| [0009](0009-no-pdf-import.md) | No PDF import in v1 | accepted |
| [0010](0010-live-feed-by-polling.md) | Live admin feed by polling | accepted |
| [0011](0011-server-derived-prospect-status.md) | Prospect status derived by the server | accepted |
| [0012](0012-workers-dev-hostname.md) | Use the workers.dev hostname | accepted |
| [0013](0013-frontend-conventions.md) | Frontend conventions — plain CSS, French UI, client state | partially superseded by 0014 |
| [0014](0014-tailwind-and-shadcn-ui.md) | Tailwind CSS and shadcn/ui for the interface | accepted — decision 2 amended by 0015 |
| [0015](0015-native-controls-on-the-field-route.md) | Native form controls on the field route where shadcn's cost breaches the bundle budget | proposed — validation decision superseded by 0018 |
| [0016](0016-autonomous-overnight-agent-runs.md) | Autonomous overnight agent runs, bounded by the repo | proposed |
| [0017](0017-zod-mini-for-the-shared-wire-contract.md) | Write the shared wire contract in `zod/mini` | proposed |
| [0018](0018-one-form-stack.md) | One form stack — react-hook-form everywhere, the field route included | proposed |
| [0019](0019-admin-chunk-out-of-the-precache.md) | Keep the admin chunk out of the service worker precache | proposed |
| [0020](0020-google-places-as-a-second-map-provider.md) | Google Places as a second map-import provider | proposed |
| [0021](0021-visits-derive-status-only-for-the-assignee.md) | A visit derives prospect status only when its author is the assignee | superseded by 0022 |
| [0022](0022-quarantine-visits-the-server-cannot-take.md) | Quarantine a visit the server cannot take, and let the admin repair it | proposed |

New ADR: copy [0000-template.md](0000-template.md), take the next number, open a PR.
