import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Configuration guards for things that fail silently and expensively.
 * A comment in a config file is not a control; these are.
 */

function readWranglerConfig(): Record<string, unknown> {
  // Strip // comments and trailing commas: wrangler.jsonc is JSONC.
  const raw = readFileSync("wrangler.jsonc", "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("wrangler.jsonc", () => {
  it("runs the Worker first only for /api/*, never for every request", () => {
    const assets = readWranglerConfig().assets as { run_worker_first?: unknown };

    // INVARIANT 14. `true` would invoke the Worker for every app-shell request,
    // moving the whole PWA from "free and unlimited" onto the 100,000/day quota.
    expect(assets.run_worker_first).toEqual(["/api/*"]);
    expect(assets.run_worker_first).not.toBe(true);
  });

  it("serves the SPA fallback for unknown paths", () => {
    const assets = readWranglerConfig().assets as { not_found_handling?: string };
    expect(assets.not_found_handling).toBe("single-page-application");
  });

  it("never carries the Google Places key as a plain var", () => {
    const vars = (readWranglerConfig().vars ?? {}) as Record<string, unknown>;

    // ADR-0020. `vars` is committed to the repo; the key is a secret and is set
    // with `wrangler secret put`. Putting it here would publish it in git and
    // in every `wrangler deploy` output, and nothing would fail.
    expect(Object.keys(vars)).not.toContain("GOOGLE_PLACES_KEY");
    expect(readFileSync("wrangler.jsonc", "utf8")).not.toContain("GOOGLE_PLACES_KEY");
  });

  it("keeps observability on, which the release checklist depends on", () => {
    const observability = readWranglerConfig().observability as { enabled?: boolean };
    expect(observability.enabled).toBe(true);
  });
});

describe("service worker", () => {
  it("never caches /api", () => {
    const config = readFileSync("vite.config.ts", "utf8");

    // INVARIANT 8. A cached sync response would show a stale today list, or
    // make a failed sync look like it succeeded.
    expect(config).toContain("navigateFallbackDenylist");
    expect(config).toMatch(/runtimeCaching:\s*\[\s*\]/);
  });

  it("exempts the reconnect marker from the SPA fallback so it reaches Access", () => {
    const config = readFileSync("vite.config.ts", "utf8");

    // spec-gh-65: navigateFallback serves every other navigation from
    // precache, which never reaches Access, so "Se reconnecter" would reload
    // an expired session straight back into itself without this entry. The
    // pattern itself lives in reconnect-marker.ts, shared with the client's
    // own navigate/strip code, so this only asserts the two are wired
    // together rather than re-deriving the regex here.
    expect(config).toContain(
      'import { RECONNECT_MARKER_PATTERN } from "./src/client/field/reconnect-marker"',
    );
    expect(config).toMatch(/navigateFallbackDenylist:\s*\[[^\]]*RECONNECT_MARKER_PATTERN/);
  });

  it("precaches the field app only, never the admin chunk", () => {
    const config = readFileSync("vite.config.ts", "utf8");

    // ADR-0019. Without this, every field phone downloads ~299 kB of TanStack
    // Query, Radix, sonner, PapaParse and Leaflet on install, for an app that
    // App.tsx will not render without a network anyway.
    // Extension-less on purpose: Leaflet's stylesheet arrives as a separate
    // `AdminApp-*.css`, which a `.js`-only ignore would keep precaching.
    expect(config).toMatch(/globIgnores:\s*\[\s*"\*\*\/assets\/AdminApp-\*"/);
  });
});
