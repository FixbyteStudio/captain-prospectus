# Captain Prospectus

B2B field-canvassing app. An admin imports restaurants and food trucks (CSV or a map area), assigns them to field agents, and watches visits arrive live. Agents work from a phone, offline-first: they walk their list, hand out flyers, run the question script, log the outcome, and add places they discover on the street.

**Hard constraint: runs at zero cost.** See [ADR-0002](docs/adr/0002-zero-cost-constraint.md).

## Status

M0 done: the app is scaffolded, CI runs lint, typecheck, tests and build, and the
sync endpoint works end to end against a local D1. Not yet deployed — the
Cloudflare account and Access application are set up by hand, see
[deployment](docs/deployment.md). Next: M1, prospects and CSV import.
See the [roadmap](docs/roadmap.md).

## Develop

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev              # then, in another terminal:
npm run db:seed:local
```

## Where to start

| You want to… | Read |
|---|---|
| Understand the product | [docs/vision.md](docs/vision.md) |
| Understand the system | [docs/architecture.md](docs/architecture.md) |
| Understand the business rules | [docs/domains/](docs/domains/) |
| Know why something is the way it is | [docs/adr/](docs/adr/) |
| Deploy | [docs/deployment.md](docs/deployment.md) |
| Contribute (humans) | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Contribute (AI agents) | [CLAUDE.md](CLAUDE.md) |

## Stack (decided)

Vite + React PWA · Hono on a single Cloudflare Worker · D1 (SQLite) + Drizzle · Dexie (IndexedDB) · Leaflet + OpenStreetMap/Overpass · Cloudflare Access.
