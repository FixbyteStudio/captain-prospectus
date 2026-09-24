import { describe, expect, it } from "vitest";
import { fieldTabs, isCurrentTab } from "./tabs";

describe("fieldTabs", () => {
  it("gives an agent two tabs: Tournée, then Ajouter", () => {
    expect(fieldTabs({ isAdmin: false }).map((t) => t.path)).toEqual([
      "/tournee",
      "/tournee/nouveau",
    ]);
  });

  it("appends Tableau de bord last for an admin", () => {
    expect(fieldTabs({ isAdmin: true }).map((t) => t.path)).toEqual([
      "/tournee",
      "/tournee/nouveau",
      "/admin/prospects",
    ]);
  });

  it("never adds a fourth tab or a Carte tab", () => {
    const paths = fieldTabs({ isAdmin: true }).map((t) => t.path);
    expect(paths).toHaveLength(3);
    expect(paths).not.toContain("/carte");
  });

  it("gives every tab a non-empty label and aria-label", () => {
    for (const tab of fieldTabs({ isAdmin: true })) {
      expect(tab.label.length).toBeGreaterThan(0);
      expect(tab.ariaLabel.length).toBeGreaterThan(0);
    }
  });

  it("marks `end` true only for the index tab /tournee, so NavLink's own matcher agrees with isCurrentTab", () => {
    expect(fieldTabs({ isAdmin: true }).map((t) => [t.path, t.end])).toEqual([
      ["/tournee", true],
      ["/tournee/nouveau", false],
      ["/admin/prospects", false],
    ]);
  });
});

describe("isCurrentTab", () => {
  // I/O matrix, spec-gh-66.
  it("Agent, round: /tournee matches only itself, Tournée current", () => {
    expect(isCurrentTab("/tournee", "/tournee")).toBe(true);
  });

  it("Agent, add: /tournee/nouveau is Ajouter current, Tournée not", () => {
    expect(isCurrentTab("/tournee/nouveau", "/tournee/nouveau")).toBe(true);
    expect(isCurrentTab("/tournee/nouveau", "/tournee")).toBe(false);
  });

  it("Visit open: /tournee/abc123 matches neither tab", () => {
    expect(isCurrentTab("/tournee/abc123", "/tournee")).toBe(false);
    expect(isCurrentTab("/tournee/abc123", "/tournee/nouveau")).toBe(false);
  });

  it("Nested add route: /tournee/nouveau/ or deeper still matches Ajouter", () => {
    expect(isCurrentTab("/tournee/nouveau/", "/tournee/nouveau")).toBe(true);
    expect(isCurrentTab("/tournee/nouveau/deep/er", "/tournee/nouveau")).toBe(true);
  });

  it("Admin online: Tableau de bord is not current on /tournee", () => {
    expect(isCurrentTab("/tournee", "/admin/prospects")).toBe(false);
  });

  it("does not let a sibling prefix pass, same rule as admin/nav.ts", () => {
    expect(isCurrentTab("/tournees", "/tournee")).toBe(false);
  });
});
