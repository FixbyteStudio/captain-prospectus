import { describe, expect, it } from "vitest";
import {
  NAV_GROUPS,
  badgeCount,
  breadcrumbFor,
  isCurrent,
  isPaletteShortcut,
  queueCount,
  shortcutHint,
} from "./nav";

/**
 * The six routes AdminApp.tsx renders under `/admin/*` today, copied here by
 * hand — this file never reads AdminApp.tsx, so update both together if a
 * route there ever changes.
 */
const ADMIN_APP_ROUTES = [
  "/admin/prospects",
  "/admin/import",
  "/admin/doublons",
  "/admin/visites",
  "/admin/a-rattacher",
  "/admin/scripts",
];

describe("NAV_GROUPS", () => {
  it("pins the group order and each group's item order", () => {
    expect(
      NAV_GROUPS.map((group) => ({ label: group.label, paths: group.items.map((i) => i.path) })),
    ).toEqual([
      {
        label: "Prospects",
        paths: ["/admin/prospects", "/admin/import", "/admin/doublons"],
      },
      {
        label: "Terrain",
        paths: ["/admin/visites", "/admin/a-rattacher", "/admin/scripts"],
      },
    ]);
  });

  it("names every route in ADMIN_APP_ROUTES exactly once, and nothing else", () => {
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    expect(paths).toHaveLength(ADMIN_APP_ROUTES.length);
    expect(new Set(paths)).toEqual(new Set(ADMIN_APP_ROUTES));
  });

  it("only Doublons and À rattacher carry a count source", () => {
    const withCount = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.count);
    expect(withCount.map((item) => [item.path, item.count])).toEqual([
      ["/admin/doublons", "duplicates"],
      ["/admin/a-rattacher", "orphans"],
    ]);
  });
});

describe("badgeCount", () => {
  it.each([
    [undefined, null],
    [0, null],
    [1, 1],
    [3, 3],
  ])("badgeCount(%s) -> %s", (input, expected) => {
    expect(badgeCount(input)).toBe(expected);
  });
});

describe("queueCount", () => {
  const pairs = (data: { pairs: unknown[] }) => data.pairs;

  it("counts the list once the query has succeeded", () => {
    expect(queueCount({ isSuccess: true, data: { pairs: [1, 2, 3] } }, pairs)).toBe(3);
    expect(queueCount({ isSuccess: true, data: { pairs: [] } }, pairs)).toBe(0);
  });

  it("has no count while loading or after a failure, even with stale data", () => {
    expect(queueCount({ isSuccess: false }, pairs)).toBeUndefined();
    expect(queueCount({ isSuccess: false, data: { pairs: [1] } }, pairs)).toBeUndefined();
  });
});

describe("isCurrent", () => {
  it("marks a deep link's own item", () => {
    const current = NAV_GROUPS.flatMap((group) => group.items).filter((item) =>
      isCurrent("/admin/a-rattacher", item.path),
    );
    expect(current.map((item) => item.path)).toEqual(["/admin/a-rattacher"]);
  });

  it("matches a trailing slash or a nested path, not a sibling prefix", () => {
    expect(isCurrent("/admin/import/", "/admin/import")).toBe(true);
    expect(isCurrent("/admin/import/zone", "/admin/import")).toBe(true);
    expect(isCurrent("/admin/imports", "/admin/import")).toBe(false);
  });
});

describe("breadcrumbFor", () => {
  it("names the group and page for a deep link (I/O matrix)", () => {
    expect(breadcrumbFor("/admin/a-rattacher")).toEqual({ group: "Terrain", page: "À rattacher" });
  });

  it("names every route NAV_GROUPS carries", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(breadcrumbFor(item.path)).toEqual({ group: group.label, page: item.label });
      }
    }
  });

  it("follows a nested path to its item, same as isCurrent", () => {
    expect(breadcrumbFor("/admin/import/zone")).toEqual({ group: "Prospects", page: "Import" });
  });

  it("has nothing to show for a path outside every group (I/O matrix, unknown path)", () => {
    expect(breadcrumbFor("/admin/xyz")).toEqual({ group: null, page: null });
  });
});

describe("shortcutHint", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "⌘K"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "⌘K"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "⌘K"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Ctrl K"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Ctrl K"],
    ["", "Ctrl K"],
  ])("shortcutHint(%s) -> %s", (userAgent, expected) => {
    expect(shortcutHint(userAgent)).toBe(expected);
  });
});

describe("isPaletteShortcut", () => {
  const key = (
    k: string | undefined,
    mods: {
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
      repeat?: boolean;
    },
  ) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    ...mods,
  });

  it("takes ⌘K and Ctrl+K, in either case (I/O matrix, shortcut)", () => {
    expect(isPaletteShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("k", { ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("K", { ctrlKey: true }))).toBe(true);
  });

  it("ignores a bare K and other chords", () => {
    expect(isPaletteShortcut(key("k", {}))).toBe(false);
    expect(isPaletteShortcut(key("b", { metaKey: true }))).toBe(false);
  });

  it("ignores a keydown with no string key — Chrome's autofill synthesizes one", () => {
    expect(isPaletteShortcut(key(undefined, { metaKey: true }))).toBe(false);
  });

  it("ignores the chord with Shift or Alt also held — those are different shortcuts", () => {
    expect(isPaletteShortcut(key("k", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPaletteShortcut(key("k", { metaKey: true, altKey: true }))).toBe(false);
  });

  it("ignores an auto-repeated keydown from a held chord", () => {
    expect(isPaletteShortcut(key("k", { metaKey: true, repeat: true }))).toBe(false);
  });
});
