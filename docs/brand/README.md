# Brand source

Artwork kept in the repo but **not deployed**. Anything in `public/` is copied to
the site root and, if it matches the service worker's `globPatterns`, precached
onto every agent's phone — so only files the app actually references belong
there.

| File | Note |
|---|---|
| `logo.svg` | The mark as real vector paths. Navy `#1b2a4a`, gold `#c9a227`. |
| `logo-form.png` | 2048×2048 raster of the same mark on `#f6f7f0`. |
| `favicon.svg` | A 246 kB PNG wrapped in an SVG, from RealFaviconGenerator. Not used: `favicon.ico` is 15 kB and does the same job. If a vector favicon is wanted, draw it from `logo.svg` instead of shipping this. |

The icons the app does serve live in `public/`; `docs/design.md` lists them.
