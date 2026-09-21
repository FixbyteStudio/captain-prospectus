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
});
