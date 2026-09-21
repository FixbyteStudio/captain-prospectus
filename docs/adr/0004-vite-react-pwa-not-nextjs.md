# ADR-0004: Vite + React PWA, not Next.js

- Status: accepted
- Date: 2026-09-21

## Context
The owner usually builds with Next.js. This app's field client must work offline; its main screens are rendered from local data, not from the server.

## Decision
We will build a client-rendered React SPA with Vite, made installable and offline-capable with vite-plugin-pwa. Routing with React Router. Build and local dev through `@cloudflare/vite-plugin` so the Worker runs in workerd during `vite dev`.

## Alternatives considered
| Option | Why not |
|---|---|
| Next.js via OpenNext on Workers | Adapter layer to maintain; SSR is the wrong model for an offline-first client and would be disabled anyway |
| Remix / React Router framework mode | Same SSR mismatch |

## Consequences
- Simpler build and deploy, smaller bundle.
- No SEO (not needed: the app is behind login).
- Server-side rendering is unavailable if ever needed; would require a new ADR.
