import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classLiterals } from "./class-literals";

/**
 * `.safe-top`/`.safe-bottom` own exactly one property each (GH #80): a plain
 * padding utility on the same element that owns the same property always
 * wins, because Tailwind v4's `utilities` layer is ordered after `base` (and,
 * after this fix, source order breaks the tie within `utilities` itself —
 * see the comment on `@layer utilities` in `app.css`). A render test cannot
 * see this: `env(safe-area-inset-bottom)` is 0 in happy-dom and the cascade
 * is never evaluated, so the `dom` project (#83) would pass either way. This
 * is the static check that regression needs.
 */

const CLIENT_DIR = fileURLToPath(new URL("../", import.meta.url));
const APP_CSS = readFileSync(fileURLToPath(new URL("./app.css", import.meta.url)), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The verbatim content of the first `@layer <name> { … }` block, braces balanced. */
function layerBlock(css: string, name: string): string {
  const marker = `@layer ${name} {`;
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`no @layer ${name} block in app.css`);
  let i = start + marker.length;
  let depth = 1;
  while (depth > 0) {
    // Bounded on purpose: a truncated app.css must fail this test, not spin
    // forever on `undefined` and hang CI.
    if (i >= css.length) throw new Error(`unbalanced @layer ${name} block in app.css`);
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start + marker.length, i - 1);
}

describe("every custom class utility lives in @layer utilities, not @layer base", () => {
  const utilities = layerBlock(APP_CSS, "utilities");
  const base = layerBlock(APP_CSS, "base");

  /** Every `.foo {` class selector declared in a layer block. */
  const classesIn = (block: string) => [
    ...new Set([...block.matchAll(/^\s*(\.[a-z][a-z0-9-]*)\s*\{/gm)].map(([, cls]) => cls)),
  ];

  // Driven off app.css rather than a hand-written list: a class added to
  // `base` later is the same GH #80 trap, and a list of three would not see
  // it. `base` keeps element and pseudo-class rules (`*`, `body`,
  // `:focus-visible`) — those are what a base layer is for.
  it("declares no custom class in @layer base (GH #80: base always loses to a plain utility)", () => {
    expect(classesIn(base), "these belong in @layer utilities").toEqual([]);
  });

  it.each([
    ".safe-top",
    ".safe-bottom",
    ".pb-page",
    ".pb-tab-bar",
    ".pb-action-bar",
    ".above-tab-bar",
  ])("%s is declared in @layer utilities", (cls) => {
    expect(utilities, "not found in @layer utilities").toContain(`${cls} {`);
  });
});

/** Every .ts/.tsx file under src/client, excluding tests. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** The utility a token sets, ignoring any `hover:`/`md:`/`data-[...]:` prefix chain. */
function utility(token: string): string {
  const parts = token.split(":");
  return parts.at(-1) ?? token;
}

// A padding utility "owns" padding-top when it is `p-*`/`pt-*`/`py-*`, and
// padding-bottom when it is `p-*`/`pb-*`/`py-*`. `.pb-page` and `.pb-tab-bar`
// are included on purpose: they fuse the inset into their own padding-bottom
// (the fix for #80), so stacking `.safe-bottom` on top of either would double
// the inset exactly the way a plain `pb-6` used to.
const OWNS_PADDING_TOP = /^p-|^pt-/;
const OWNS_PADDING_BOTTOM = /^p-|^pb-/;
const OWNS_PADDING_Y = /^py-/;

describe("no element pairs .safe-top/.safe-bottom with a padding utility on the same property", () => {
  const files = walk(CLIENT_DIR);

  it.each(files)("%s", (file) => {
    const source = readFileSync(file, "utf8");
    for (const literal of classLiterals(source)) {
      const tokens = literal.split(/\s+/).map(utility);
      if (tokens.includes("safe-top")) {
        const clash = tokens.find((t) => OWNS_PADDING_TOP.test(t) || OWNS_PADDING_Y.test(t));
        expect(clash, `${file}: "${literal}" — .safe-top's padding-top loses to ${clash}`).toBe(
          undefined,
        );
      }
      if (tokens.includes("safe-bottom")) {
        const clash = tokens.find((t) => OWNS_PADDING_BOTTOM.test(t) || OWNS_PADDING_Y.test(t));
        expect(
          clash,
          `${file}: "${literal}" — .safe-bottom's padding-bottom loses to ${clash}`,
        ).toBe(undefined);
      }
    }
  });
});
