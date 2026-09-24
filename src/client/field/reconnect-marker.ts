/**
 * The "Se reconnecter" marker — isolated, pure and import-free so both sides
 * that must agree on its exact shape use the same source: `vite.config.ts`
 * (Node, builds the service worker's `navigateFallbackDenylist`) and the
 * client's own navigate/strip code (`sync-view.ts`, `App.tsx`). Two regexes
 * built separately from the same intent is how they drift.
 */

const PARAM = "reconnect";
const VALUE = "1";
// Only `URL` needs an origin to parse; nothing here uses one, since every
// export returns or matches a path the SPA navigates to or replaces on
// whatever origin it is already running on.
const PARSE_BASE = "http://reconnect.invalid/";

/**
 * Matches the marker in a `pathname + search` string — the shape Workbox
 * matches `navigateFallbackDenylist` against. Anchored on both sides so
 * `reconnect=10` and `xreconnect=1` do not match.
 */
export const RECONNECT_MARKER_PATTERN = /[?&]reconnect=1(?:&|$)/;

function toPath(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The current URL plus the marker. The service worker serves every other
 * navigation from precache (`navigateFallback: "index.html"`), which never
 * reaches Cloudflare Access, so a plain reload cannot re-authenticate an
 * expired session; this marker is the one entry `navigateFallbackDenylist`
 * excludes from that fallback, so this one navigation goes to the network and
 * through Access (docs/domains/identity-access.md § Offline and session
 * expiry).
 */
export function reconnectUrl(href: string): string {
  const url = new URL(href, PARSE_BASE);
  url.searchParams.set(PARAM, VALUE);
  return toPath(url);
}

/** Strips the marker once the reconnecting navigation has landed. Idempotent:
 * safe to call on every load whether or not the marker is present. */
export function withoutReconnectMarker(href: string): string {
  const url = new URL(href, PARSE_BASE);
  url.searchParams.delete(PARAM);
  return toPath(url);
}

/** Whether `location.search` (or any query string) carries the marker. */
export function hasReconnectMarker(search: string): boolean {
  return RECONNECT_MARKER_PATTERN.test(search);
}
