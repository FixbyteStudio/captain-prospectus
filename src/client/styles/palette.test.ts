import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * docs/design.md makes specific contrast claims about the palette. This turns
 * them into something that fails CI when a hex is nudged, rather than something
 * a reader has to take on trust.
 *
 * The tokens are parsed out of app.css rather than duplicated here, so the
 * stylesheet stays the single source of truth.
 */

const CSS = readFileSync(new URL("./app.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in app.css`);
  const block = CSS.slice(start, CSS.indexOf("color-scheme", start));
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)) {
    const [, name, value] = match;
    if (name && value) found[name] = value;
  }
  return found;
}

const LIGHT = tokens(":root {");
const DARK = tokens(':root[data-theme="dark"]');

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = linear as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 1.4.3 for text, 1.4.11 for the boundary of a control. */
const TEXT = 4.5;
const CONTROL = 3;

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s palette", (_name, t) => {
  it("parsed every token it needs", () => {
    for (const key of [
      "--background",
      "--foreground",
      "--card",
      "--muted-foreground",
      "--primary",
      "--primary-foreground",
      "--primary-edge",
      "--ring",
      "--success",
      "--warn",
      "--destructive",
      "--band",
      "--band-foreground",
      "--band-muted",
    ]) {
      expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each([
    ["ink on card", "--foreground", "--card"],
    ["ink on page", "--foreground", "--background"],
    ["muted text on card", "--muted-foreground", "--card"],
    ["converted on card", "--success", "--card"],
    ["follow_up on card", "--warn", "--card"],
    ["rejected on card", "--destructive", "--card"],
    ["button label on gold", "--primary-foreground", "--primary"],
    ["band text on band", "--band-foreground", "--band"],
    ["band nav on band", "--band-muted", "--band"],
  ])("%s clears AA for text", (_label, fg, bg) => {
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each([
    // The gold fill itself is only ~2.2:1 on the page, which is why the button
    // carries its own edge. It is the edge that has to clear 3:1, not the fill.
    ["button edge against the page", "--primary-edge", "--background"],
    ["button edge against a card", "--primary-edge", "--card"],
    ["focus ring against a card", "--ring", "--card"],
    ["focus ring against the page", "--ring", "--background"],
  ])("%s clears the 3:1 a control needs", (_label, fg, bg) => {
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(CONTROL);
  });

  it("labels its gold button with something other than the card colour", () => {
    expect(t["--primary-foreground"]).not.toBe(t["--card"]);
  });
});

describe("light palette", () => {
  it("cannot use the brand gold as text", () => {
    // Recorded rather than aspired to: gold on a light surface is about 2.3:1,
    // which is why --primary is a fill and --ring points at the ink instead.
    // In dark mode the same gold clears 8:1, so this is a light-mode rule only.
    expect(contrast(LIGHT["--primary"] as string, LIGHT["--card"] as string)).toBeLessThan(TEXT);
    expect(contrast(LIGHT["--ring"] as string, LIGHT["--card"] as string)).toBeGreaterThan(
      contrast(LIGHT["--primary"] as string, LIGHT["--card"] as string),
    );
  });
});

describe("status ramp", () => {
  it("keeps follow_up and converted in different colour families", () => {
    // They are the two statuses an admin acts on differently, and the brand
    // gold sits close to mustard — so this is the pair most at risk of merging.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const max = Math.max(r, g, b);
      const delta = max - Math.min(r, g, b);
      if (delta === 0) return 0;
      const raw =
        max === r
          ? ((g - b) / delta + 6) % 6
          : max === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4;
      return raw * 60;
    };

    for (const t of [LIGHT, DARK]) {
      const apart = Math.abs(hue(t["--warn"] as string) - hue(t["--success"] as string));
      expect(apart).toBeGreaterThan(25);
    }
  });
});
