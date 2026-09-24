import { describe, expect, it } from "vitest";
import { shouldAsk } from "./leave-guard";

describe("shouldAsk", () => {
  // I/O matrix, spec-gh-66.
  it("asks when the form is dirty and the tap goes elsewhere", () => {
    expect(shouldAsk({ dirty: true, to: "/tournee", current: "/tournee/abc123" })).toBe(true);
  });

  it("navigates straight away when the form is untouched", () => {
    expect(shouldAsk({ dirty: false, to: "/tournee", current: "/tournee/nouveau" })).toBe(false);
  });

  it("never asks when the tap is already the current tab, dirty or not", () => {
    expect(shouldAsk({ dirty: true, to: "/tournee", current: "/tournee" })).toBe(false);
    expect(shouldAsk({ dirty: false, to: "/tournee", current: "/tournee" })).toBe(false);
  });

  it("never asks on a tab that reads as current under isCurrentTab's subtree rule", () => {
    // Ajouter draws as current on a nested add route too (tabs.test.ts), so
    // tapping it there must not open the dialog even though the pathname
    // itself isn't the exact string "/tournee/nouveau".
    expect(shouldAsk({ dirty: true, to: "/tournee/nouveau", current: "/tournee/nouveau/" })).toBe(
      false,
    );
  });
});
