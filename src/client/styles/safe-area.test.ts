import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classLiteralGroups } from "./class-literals";
import { walkSourceFiles } from "./scan-files";

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

/**
 * The verbatim content of every `@layer <name> { … }` block, braces balanced
 * and concatenated — a second `@layer base` block added later is the same
 * GH #80 trap as the first, so a guard that only reads the first would miss it.
 */
function layerBlocks(css: string, name: string): string {
  const marker = `@layer ${name} {`;
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
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
    bodies.push(css.slice(start + marker.length, i - 1));
    from = i;
  }
  if (bodies.length === 0) throw new Error(`no @layer ${name} block in app.css`);
  return bodies.join("\n");
}

/**
 * Every `{ selector, body }` pair opening a rule in a block — not just a bare
 * `.foo {` line, so `.foo:hover {`, `.dark .foo {` or a selector list
 * (`.foo, .bar {`) are all caught too, and a rule nested in `@media { … }`
 * still yields its own selector and body as one pair (the media wrapper's own
 * `{`/`}` never forms a balanced `([^{}]+)\{([^{}]*)\}` match, so it is
 * skipped rather than merged into anything).
 */
function selectorBodyPairs(block: string): { selector: string; body: string }[] {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector ?? "",
    body: body ?? "",
  }));
}

function classesOf(selector: string): string[] {
  return selector.match(/\.[a-zA-Z][\w-]*/g) ?? [];
}

describe("every custom class utility lives in @layer utilities, not @layer base", () => {
  const utilities = layerBlocks(APP_CSS, "utilities");
  const base = layerBlocks(APP_CSS, "base");

  const classesIn = (block: string) => [
    ...new Set(selectorBodyPairs(block).flatMap(({ selector }) => classesOf(selector))),
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
    expect(classesIn(utilities), "not found in @layer utilities").toContain(cls);
  });
});

/** The utility a token sets, ignoring any `hover:`/`md:`/`data-[...]:` prefix chain. */
function utility(token: string): string {
  const parts = token.split(":");
  return parts.at(-1) ?? token;
}

/**
 * Every custom utility in `@layer utilities` that declares `padding-top`,
 * `padding-bottom` or the `padding` shorthand — read from app.css rather than
 * guessed from the class name, so `.above-tab-bar` (which owns
 * `padding-bottom` but whose name gives no hint of that) is not missed the
 * way a `pb-`-prefix heuristic would miss it.
 */
function customPaddingOwners(utilities: string): { top: Set<string>; bottom: Set<string> } {
  const top = new Set<string>();
  const bottom = new Set<string>();
  for (const { selector, body } of selectorBodyPairs(utilities)) {
    const ownsTop = /padding-top\s*:/.test(body) || /padding\s*:/.test(body);
    const ownsBottom = /padding-bottom\s*:/.test(body) || /padding\s*:/.test(body);
    if (!ownsTop && !ownsBottom) continue;
    for (const cls of classesOf(selector).map((c) => c.slice(1))) {
      if (ownsTop) top.add(cls);
      if (ownsBottom) bottom.add(cls);
    }
  }
  return { top, bottom };
}

const CUSTOM = customPaddingOwners(layerBlocks(APP_CSS, "utilities"));

// A Tailwind utility "owns" padding-top when it is `p-*`/`pt-*`/`py-*`, and
// padding-bottom when it is `p-*`/`pb-*`/`py-*`; `CUSTOM` adds every app.css
// utility that owns the same property under a name Tailwind's own pattern
// would not recognise (`.above-tab-bar`, `.pb-tab-bar`'s `768px` step no
// less than its mobile one). `safe-top`/`safe-bottom` are excluded from the
// "other owner" side of their own check — `CUSTOM` includes them too, since
// they are declared the same way, but a class cannot clash with itself.
const ownsPaddingTop = (t: string) =>
  t !== "safe-top" && (/^p-|^pt-|^py-/.test(t) || CUSTOM.top.has(t));
const ownsPaddingBottom = (t: string) =>
  t !== "safe-bottom" && (/^p-|^pb-|^py-/.test(t) || CUSTOM.bottom.has(t));

describe("no element pairs .safe-top/.safe-bottom with a padding utility on the same property", () => {
  const files = walkSourceFiles(CLIENT_DIR);

  it.each(files)("%s", (file) => {
    const source = readFileSync(file, "utf8");
    // The union of a `cn(...)` call's own string arguments, not each in
    // isolation: `cn()` merges them onto one element, so `safe-bottom` in one
    // argument and a `pb-*`/`py-*` in a sibling argument still collide on the
    // element that renders (GH #67 review: `FieldTabs.tsx`'s wrapper div).
    for (const group of classLiteralGroups(source)) {
      const tokens = group.flatMap((literal) => literal.split(/\s+/).map(utility));
      if (tokens.includes("safe-top")) {
        const clash = tokens.find(ownsPaddingTop);
        expect(
          clash,
          `${file}: ${JSON.stringify(group)} — .safe-top's padding-top loses to ${clash}`,
        ).toBe(undefined);
      }
      if (tokens.includes("safe-bottom")) {
        const clash = tokens.find(ownsPaddingBottom);
        expect(
          clash,
          `${file}: ${JSON.stringify(group)} — .safe-bottom's padding-bottom loses to ${clash}`,
        ).toBe(undefined);
      }
    }
  });
});
