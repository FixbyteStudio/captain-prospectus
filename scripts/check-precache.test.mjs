/**
 * The control needs its own control: this runs `check-precache.mjs` itself
 * (as a subprocess, over a throwaway fixture tree — not the real `dist/`) so
 * a change to it that breaks the ceiling check, the absent-build message, or
 * the empty-manifest guard fails CI instead of only being caught the next
 * time someone reads the build log by hand (GH #67, matrix-audit follow-up).
 *
 * `CHECK_PRECACHE_ROOT`/`CHECK_PRECACHE_CEILING_KIB` are the script's own test
 * seam; the real CLI (package.json, ci.yml) never sets them.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-precache.mjs", import.meta.url));

/** A throwaway root with dist/client/sw.js and, optionally, vite.config.ts. */
function makeFixture({ swBody, viteGlobPatterns, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-precache-"));
  const distClient = join(root, "dist", "client");
  mkdirSync(distClient, { recursive: true });

  if (swBody !== undefined) {
    writeFileSync(join(distClient, "sw.js"), `precacheAndRoute([${swBody}],{})`);
  }
  if (viteGlobPatterns) {
    writeFileSync(
      join(root, "vite.config.ts"),
      `export default { workbox: { globPatterns: ["${viteGlobPatterns}"] } };`,
    );
  }
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(distClient, name), "x".repeat(bytes));
  }
  return root;
}

const roots = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

/** Runs the real script as a subprocess, exactly as `pnpm check:precache` does. */
function run(root, { ceilingKiB } = {}) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHECK_PRECACHE_ROOT: root,
      ...(ceilingKiB !== undefined ? { CHECK_PRECACHE_CEILING_KIB: String(ceilingKiB) } : {}),
    },
  });
}

describe("check-precache.mjs", () => {
  it("exits 0 and prints the total when under the ceiling", () => {
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null},{url:"b.css",revision:"x"},{url:"c.png",revision:"y"}',
      viteGlobPatterns: "**/*.{js,css}",
      // 1 KiB + 1 KiB counted; c.png (not in globPatterns) is precached but
      // uncounted, same as the real manifest icons (see the script's comment).
      files: { "a.js": 1024, "b.css": 1024, "c.png": 5000 },
    });
    roots.push(root);

    const result = run(root, { ceilingKiB: 1000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("3 entries (2.00 KiB)");
  });

  it("exits non-zero and still prints the total when over the ceiling", () => {
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null},{url:"b.css",revision:"x"}',
      viteGlobPatterns: "**/*.{js,css}",
      files: { "a.js": 1024, "b.css": 1024 },
    });
    roots.push(root);

    const result = run(root, { ceilingKiB: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("2.00 KiB");
    expect(result.stderr).toContain("2.00 KiB exceeds the 1 KiB ceiling");
  });

  it("exits non-zero and says to build first when dist/client/sw.js is absent", () => {
    const root = makeFixture(); // no swBody: dist/client exists, sw.js does not
    roots.push(root);

    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Run "pnpm build" first');
  });

  it("exits non-zero when the manifest has no entries", () => {
    const root = makeFixture({ swBody: "" });
    roots.push(root);

    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("lists no entries");
  });

  it("exits non-zero when vite.config.ts has no globPatterns to size against", () => {
    const root = makeFixture({ swBody: '{url:"a.js",revision:null}', files: { "a.js": 1024 } });
    roots.push(root);

    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no vite\.config\.ts|no globPatterns/);
  });

  it("exits non-zero when sw.js holds no precacheAndRoute call at all", () => {
    const root = mkdtempSync(join(tmpdir(), "check-precache-"));
    mkdirSync(join(root, "dist", "client"), { recursive: true });
    writeFileSync(join(root, "dist", "client", "sw.js"), "self.skipWaiting();");
    roots.push(root);

    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("no precacheAndRoute");
  });

  it("exits non-zero when a manifest entry has no file behind it", () => {
    // A broken build, not a precache problem — and never a raw ENOENT stack.
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null},{url:"gone.js",revision:null}',
      viteGlobPatterns: "**/*.{js,css}",
      files: { "a.js": 1024 },
    });
    roots.push(root);

    const result = run(root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('lists "gone.js"');
  });

  it("exits non-zero rather than passing when the ceiling override is not a number", () => {
    // The one outcome this guard must never have: NaN comparisons are all
    // false, so a typo'd ceiling would report success.
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null}',
      viteGlobPatterns: "**/*.{js,css}",
      files: { "a.js": 1024 },
    });
    roots.push(root);

    const result = run(root, { ceilingKiB: "abc" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not a positive number");
  });

  it("exits 0 against the real 1,000 KiB default when the override is omitted", () => {
    // Every case above sets CHECK_PRECACHE_CEILING_KIB, so none of them ever
    // exercises the default the real `pnpm check:precache` enforces — only
    // config.test.ts's source-text regex did, which would still pass if the
    // default moved. 999 KiB, just under it.
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null}',
      viteGlobPatterns: "**/*.{js}",
      files: { "a.js": 999 * 1024 },
    });
    roots.push(root);

    const result = run(root); // no ceilingKiB: exercises the 1000 default

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("999.00 KiB");
  });

  it("exits non-zero against the real 1,000 KiB default when the override is omitted", () => {
    // The mirror case, 1001 KiB: over the default with nothing set.
    const root = makeFixture({
      swBody: '{url:"a.js",revision:null}',
      viteGlobPatterns: "**/*.{js}",
      files: { "a.js": 1001 * 1024 },
    });
    roots.push(root);

    const result = run(root); // no ceilingKiB: exercises the 1000 default

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("exceeds the 1000 KiB ceiling");
  });

  it("fails closed when the manifest format changes so only some entries parse", () => {
    // Single-quoted url: the pattern matches one of two, which must not yield
    // a plausible subtotal under the ceiling.
    const root = makeFixture({
      swBody: "{url:\"a.js\",revision:null},{url:'b.js',revision:null}",
      viteGlobPatterns: "**/*.{js,css}",
      files: { "a.js": 1024, "b.js": 1024 },
    });
    roots.push(root);

    const result = run(root, { ceilingKiB: 1000 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("parsed 1 of 2 manifest entries");
  });
});
