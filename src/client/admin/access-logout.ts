/**
 * Access's own logout endpoint — isolated, pure and import-free so both sides
 * that must agree on its exact shape use the same source: `vite.config.ts`
 * (Node, builds the service worker's `navigateFallbackDenylist`) and
 * `AccountMenu`'s logout link. Two literals maintained separately is how they
 * drift (GH #76, spec-gh-64) — the same reasoning as `field/reconnect-marker.ts`.
 */

/** Where "Se déconnecter" points. */
export const LOGOUT_PATH = "/cdn-cgi/access/logout";

/**
 * Matches Access's whole `/cdn-cgi/` surface — what `navigateFallbackDenylist`
 * excludes from the SPA fallback, so a click reaches the network instead of
 * the precached shell.
 */
export const ACCESS_PATH_PATTERN = /^\/cdn-cgi\//;
