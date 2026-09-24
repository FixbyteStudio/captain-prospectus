import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  otherTheme,
  parseTheme,
  pinTheme,
  resolvedTheme,
  writePin,
} from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["blue", null],
    ["", null],
    [null, null],
  ])("parseTheme(%s) -> %s", (raw, expected) => {
    expect(parseTheme(raw)).toBe(expected);
  });
});

describe("otherTheme", () => {
  it("flips light and dark", () => {
    expect(otherTheme("light")).toBe("dark");
    expect(otherTheme("dark")).toBe("light");
  });
});

describe("resolvedTheme", () => {
  it("follows the system while nothing is pinned (I/O matrix, system flips)", () => {
    expect(resolvedTheme(undefined, false)).toBe("light");
    expect(resolvedTheme(undefined, true)).toBe("dark");
  });

  it("lets a pin win over the system", () => {
    expect(resolvedTheme("light", true)).toBe("light");
    expect(resolvedTheme("dark", false)).toBe("dark");
  });

  it("ignores an attribute that is not a theme", () => {
    expect(resolvedTheme("blue", true)).toBe("dark");
  });
});

// No jsdom in this project (vitest.config.ts runs the "unit" project under
// node), so `localStorage` is stubbed per test rather than a real browser API
// — this also lets the "blocked" case throw on demand.
function fakeStorage(store = new Map<string, string>()) {
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

describe("writePin", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("swallows a storage that throws (I/O matrix, storage blocked)", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => writePin("dark")).not.toThrow();
  });
});

// Runs the inline script itself, so the rule it duplicates from parseTheme is
// tested where it actually runs, before first paint — shared by the
// "index.html boot script" and "pinTheme" describes below.
const html = readFileSync("index.html", "utf8");
const match = /<script>([\s\S]*?)<\/script>/.exec(html);
if (!match?.[1]) throw new Error("index.html has no inline boot script");
const boot = new Function("localStorage", "document", match[1]) as (
  storage: { getItem: (key: string) => string | null },
  doc: { documentElement: { dataset: Record<string, string> } },
) => void;

function runBoot(storage: { getItem: (key: string) => string | null }) {
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  boot(storage, doc);
  return doc.documentElement.dataset.theme;
}

describe("index.html", () => {
  it("boots the theme from the same storage key this module reads (spec-gh-64)", () => {
    // Tied together the way config.test.ts ties RECONNECT_MARKER_PATTERN to
    // vite.config.ts: the boot script cannot import THEME_STORAGE_KEY (a
    // module script is deferred past first paint), so this only asserts the
    // two literals match rather than re-deriving the key.
    expect(html).toContain(`"${THEME_STORAGE_KEY}"`);
  });
});

describe("index.html boot script", () => {
  it("applies a stored pin before first paint (I/O matrix, pin survives)", () => {
    expect(runBoot({ getItem: (key) => (key === THEME_STORAGE_KEY ? "dark" : null) })).toBe("dark");
  });

  it("leaves the system in charge for garbage or no pin", () => {
    expect(runBoot({ getItem: () => "blue" })).toBeUndefined();
    expect(runBoot({ getItem: () => null })).toBeUndefined();
  });

  it("survives a storage that throws (I/O matrix, storage blocked)", () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
    };
    expect(runBoot(blocked)).toBeUndefined();
  });
});

describe("pinTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("writes the storage pin and the <html data-theme> attribute together", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const root = { dataset: {} as Record<string, string | undefined> };

    pinTheme("dark", root);

    expect(root.dataset.theme).toBe("dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("still flips the attribute when storage throws (I/O matrix, storage blocked)", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const root = { dataset: {} as Record<string, string | undefined> };

    expect(() => pinTheme("dark", root)).not.toThrow();
    expect(root.dataset.theme).toBe("dark");
  });

  it("pins a theme the boot script reads back on the next load — the point of storing it", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);

    pinTheme("dark", { dataset: {} });

    expect(runBoot(storage)).toBe("dark");
  });
});
