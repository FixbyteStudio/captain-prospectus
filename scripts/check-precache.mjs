/**
 * Fails the build over the field precache ceiling ADR-0026 sets: 1,000 KiB.
 *
 * ADR-0026 named that ceiling as a line a human reads off `pnpm build`'s own
 * Workbox output ("harder: the ceiling is still read by hand" — its
 * consequences, and the follow-up work at the end of that ADR). This is that
 * follow-up: it reads the same manifest Workbox already wrote to
 * `dist/client/sw.js`, sums the same bytes, and exits non-zero instead of
 * leaving the number for review to catch.
 *
 * Run after `pnpm build` (wired as `check:precache` in package.json and
 * ci.yml), never instead of it: this script trusts the build's own output
 * rather than re-running Rollup or Workbox itself.
 *
 * `CHECK_PRECACHE_ROOT`/`CHECK_PRECACHE_CEILING_KIB` are a seam for
 * `check-precache.test.mjs` only — the real CLI (package.json, ci.yml) never
 * sets them, so its behaviour and output are unchanged.
 */
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CEILING_KIB = (() => {
  const override = process.env.CHECK_PRECACHE_CEILING_KIB;
  if (override === undefined) return 1000;
  const parsed = Number(override);
  // Fail closed: a NaN ceiling would make every comparison below false, so the
  // guard would pass while claiming to enforce — the one outcome it must never
  // have.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(
      `check:precache — CHECK_PRECACHE_CEILING_KIB is not a positive number: "${override}".`,
    );
    process.exit(1);
  }
  return parsed;
})();
const ROOT = process.env.CHECK_PRECACHE_ROOT
  ? resolve(process.env.CHECK_PRECACHE_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_CLIENT = join(ROOT, "dist", "client");
const SW_PATH = join(DIST_CLIENT, "sw.js");

let sw;
try {
  sw = readFileSync(SW_PATH, "utf8");
} catch {
  console.error(
    `check:precache — no ${SW_PATH}. Run "pnpm build" first; this script reads its output, it does not build.`,
  );
  process.exit(1);
}

// Workbox's generateSW writes one precacheAndRoute([{url,revision}, …], …)
// call; URLs are relative to dist/client/. No JSON parse: revision is either
// a quoted hash or the bare literal `null`.
const call = /precacheAndRoute\(\[([\s\S]*?)\],\s*\{/.exec(sw);
if (call === null) {
  console.error(`check:precache — no precacheAndRoute([...]) call found in ${SW_PATH}.`);
  process.exit(1);
}

// An empty manifest (`precacheAndRoute([], …)`) captures "" — falsy, but a
// real match — so this is checked on the array, not on `call[1]` itself.
const urls = [...call[1].matchAll(/\{url:"([^"]+)"/g)].map(([, url]) => url);
if (urls.length === 0) {
  console.error(`check:precache — precacheAndRoute([...]) in ${SW_PATH} lists no entries.`);
  process.exit(1);
}

// Fail closed if the pattern above matched only some of the manifest: a future
// Workbox or minifier that quotes an entry differently would otherwise yield a
// plausible subtotal and pass a ceiling it is no longer measuring.
const declared = (call[1].match(/\burl:/g) ?? []).length;
if (declared !== urls.length) {
  console.error(
    `check:precache — parsed ${urls.length} of ${declared} manifest entries in ${SW_PATH}. The precacheAndRoute format changed; update this script rather than trusting a partial total.`,
  );
  process.exit(1);
}

// Workbox's own console line (vite-plugin-pwa, generateSW mode) sums bytes
// only for entries it found by globbing `globPatterns` in vite.config.ts —
// the web-manifest icons and manifest.webmanifest itself arrive afterwards as
// pre-hashed `additionalManifestEntries` and are precached (real bytes on a
// phone) without ever being sized into that total. Reading the same
// extension list from vite.config.ts, rather than repeating it here,
// reproduces that line exactly instead of drifting from it if it changes.
let viteConfig;
try {
  viteConfig = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
} catch {
  console.error(
    `check:precache — no vite.config.ts under ${ROOT}; cannot tell which entries Workbox sizes into its own total.`,
  );
  process.exit(1);
}
const globExtensions = /globPatterns:\s*\[\s*"\*\*\/\*\.\{([^}]+)\}"/
  .exec(viteConfig)?.[1]
  // "{js, css}" (a space after the comma) is valid in vite.config.ts and must
  // not silently shrink the total: an untrimmed " css" never matches a url's
  // trailing ".css", so that entry would quietly stop counting.
  ?.split(",")
  .map((ext) => ext.trim());
if (!globExtensions) {
  console.error(`check:precache — no globPatterns: ["**/*.{...}"] found in vite.config.ts.`);
  process.exit(1);
}
const countsTowardTotal = (url) => globExtensions.some((ext) => url.endsWith(`.${ext}`));

const entries = urls.map((url) => {
  // Decode and stat in one try: a bad escape (a lone "%") must report its own
  // message, not fall through into `join()` with `undefined` and throw a
  // second, unrelated TypeError before the process actually exits.
  let bytes;
  try {
    bytes = statSync(join(DIST_CLIENT, decodeURIComponent(url))).size;
  } catch (error) {
    if (error instanceof URIError) {
      console.error(`check:precache — ${SW_PATH} lists "${url}", which is not a valid URI.`);
    } else {
      // A manifest entry with no file behind it is a broken build, not a
      // precache problem — say which, rather than throwing a raw ENOENT stack
      // that reads as a crashed CI step.
      console.error(
        `check:precache — ${SW_PATH} lists "${url}", which is not a file under ${DIST_CLIENT}.`,
      );
    }
    process.exit(1);
  }
  return { url, bytes, counted: countsTowardTotal(url) };
});

const totalBytes = entries.filter((e) => e.counted).reduce((sum, entry) => sum + entry.bytes, 0);
const totalKiB = totalBytes / 1024;

// Self-describing: with the env-var seam set (only ever true under
// check-precache.test.mjs), a passing run would otherwise say nothing about
// measuring a different tree or a different ceiling than the real one.
const overrides = [
  process.env.CHECK_PRECACHE_ROOT ? `root ${ROOT}` : null,
  process.env.CHECK_PRECACHE_CEILING_KIB ? `ceiling overridden` : null,
]
  .filter(Boolean)
  .join(", ");
console.log(
  `check:precache — ${entries.length} entries (${totalKiB.toFixed(2)} KiB) against a ${CEILING_KIB} KiB ceiling${overrides ? ` [${overrides}]` : ""}`,
);
for (const entry of [...entries].sort((a, b) => b.bytes - a.bytes)) {
  const note = entry.counted
    ? ""
    : "  (precached, not sized in the Workbox total — see comment above)";
  console.log(`  ${(entry.bytes / 1024).toFixed(2)} KiB  ${entry.url}${note}`);
}

if (totalKiB > CEILING_KIB) {
  console.error(
    `check:precache — ${totalKiB.toFixed(2)} KiB exceeds the ${CEILING_KIB} KiB ceiling (ADR-0026). Move the new weight to a lazy admin chunk, or renegotiate the ADR.`,
  );
  process.exit(1);
}
