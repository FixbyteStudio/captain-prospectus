import { describe, expect, it } from "vitest";
import { NAV_GROUPS, badgeCount, isCurrent, queueCount } from "./nav";

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
