import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * docs/design.md › Colour states five palette rules and a set of contrast
 * claims. This turns them into something that fails CI when a hex is nudged,
 * rather than something a reader has to take on trust.
 *
 * The tokens are parsed out of app.css rather than duplicated here, so the
 * stylesheet stays the single source of truth. Every rule runs once per theme:
 * light, dark pinned with data-theme, and dark from the system.
 */

const CSS = readFileSync(new URL("./app.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The declarations of the first block that opens with `selector`, verbatim. */
function block(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`no ${selector} block in app.css`);
  const open = start + selector.length;
  const body = CSS.slice(open, CSS.indexOf("}", open));
  const found: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    // Prettier wraps a long color-mix over several lines; fold it back to one.
    if (name && value) {
      found[name] = value.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
    }
  }
  return found;
}

const THEME_INLINE = block("@theme inline {");
const ROOT = block(":root {");
// `:root:not([data-theme="light"])` also appears in @custom-variant, but never
// followed by ` {`, so this finds the media-query block.
const SYSTEM_DARK = block(':root:not([data-theme="light"]) {');
const PINNED_DARK = block(':root[data-theme="dark"] {');

type Theme = Record<string, string>;

/** A dark block applies to the same :root, so it keeps what it does not override. */
const THEMES: [string, Theme][] = [
  ["light", ROOT],
  ["dark (data-theme)", { ...ROOT, ...PINNED_DARK }],
  ["dark (system)", { ...ROOT, ...SYSTEM_DARK }],
];

// ---------------------------------------------------------------------------
// Colour maths: just enough of CSS Color 4/5 to evaluate the declarations above.

/** sRGB channels and alpha, each 0–1. */
type Rgba = [number, number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function parseHex(hex: string): Rgba {
  if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) throw new Error(`not a hex colour: ${hex}`);
  const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return [byte(1), byte(3), byte(5), hex.length === 9 ? byte(7) : 1];
}

function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(clamp(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// Björn Ottosson's matrices, as CSS Color 4 specifies them.
function toOklab([r, g, b]: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number], alpha: number): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => clamp(toGamma(c)));
  return [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, alpha];
}

/** color-mix(in oklab, x p, y): premultiplied, so a transparent side adds no hue. */
function mixOklab(x: Rgba, p: number, y: Rgba): Rgba {
  const alpha = x[3] * p + y[3] * (1 - p);
  if (alpha === 0) return [0, 0, 0, 0];
  const [lx, ly] = [toOklab(x), toOklab(y)];
  const channel = (i: 0 | 1 | 2) => (lx[i] * x[3] * p + ly[i] * y[3] * (1 - p)) / alpha;
  return fromOklab([channel(0), channel(1), channel(2)], alpha);
}

/** Paints a colour over an opaque one, as the browser does: in gamma-encoded sRGB. */
function over(top: Rgba, under: Rgba): Rgba {
  const [r, g, b] = [0, 1, 2].map((i) => (top[i] ?? 0) * top[3] + (under[i] ?? 0) * (1 - top[3]));
  return [r ?? 0, g ?? 0, b ?? 0, 1];
}

const MIX = /^color-mix\(in oklab, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/;

/** Evaluates a hex, `transparent`, `var(--x)` or an oklab color-mix of those. */
function evaluate(value: string, t: Theme, seen: string[] = []): Rgba {
  if (value === "transparent") return [0, 0, 0, 0];
  if (value.startsWith("#")) return parseHex(value);
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
  if (ref) {
    if (seen.includes(ref)) throw new Error(`${ref} refers to itself`);
    const raw = t[ref];
    if (raw === undefined) throw new Error(`${ref} is not declared`);
    return evaluate(raw, t, [...seen, ref]);
  }
  const mix = MIX.exec(value);
  if (mix?.[1] && mix[2] && mix[3]) {
    return mixOklab(evaluate(mix[1], t, seen), Number(mix[2]) / 100, evaluate(mix[3], t, seen));
  }
  throw new Error(`cannot evaluate ${value}`);
}

/** A token as the eye sees it on `under` (the card unless said otherwise), as hex. */
function solid(t: Theme, token: string, under = "--card"): string {
  return toHex(over(evaluate(`var(${token})`, t), evaluate(`var(${under})`, t)));
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).slice(0, 3).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** How far apart two hues are on the colour wheel, 0–180°. */
function hueDistance(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return Math.min(d, 360 - d);
}

function hue(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const raw =
    max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return raw * 60;
}

/** WCAG 1.4.3 for text, 1.4.11 for the boundary of a control. */
const TEXT = 4.5;
const CONTROL = 3;

// ---------------------------------------------------------------------------

describe("the token set", () => {
  // DESIGN.md's colour names, kept here by hand: the test never reads DESIGN.md.
  const DESIGN_COLOURS = [
    "background",
    "card",
    "foreground",
    "secondary",
    "muted-foreground",
    "border",
    "primary",
    "primary-foreground",
    "primary-edge",
    "ring",
    "success",
    "warn",
    "destructive",
    "on-destructive",
    "band",
    "band-foreground",
    "band-muted",
    "band-accent",
    "band-border",
    "status-new",
    "status-assigned",
    "outcome-no-contact",
    "outcome-interested",
    "outcome-not-interested",
    "tint-assigned",
    "tint-warn",
    "tint-success",
    "tint-destructive",
    "tint-outcome-interested",
    "tint-outcome-not-interested",
  ];
  // shadcn's components already expect destructive-foreground for text on the
  // destructive fill; a second utility name for the same colour would drift.
  const UTILITY_NAME: Record<string, string> = { "on-destructive": "destructive-foreground" };

  it.each(THEMES)("every DESIGN.md colour resolves in %s", (_theme, t) => {
    for (const name of DESIGN_COLOURS) {
      const utility = `--color-${UTILITY_NAME[name] ?? name}`;
      const value = THEME_INLINE[utility];
      expect(value, `${name}: no ${utility} in @theme inline`).toMatch(/^var\(--[a-z0-9-]+\)$/);
      expect(() => evaluate(value as string, t), name).not.toThrow();
    }
  });

  it("declares every light hex colour again in dark", () => {
    // Otherwise a token dropped from both dark blocks would silently inherit
    // its light value.
    for (const [name, value] of Object.entries(ROOT)) {
      if (value.startsWith("#")) expect(PINNED_DARK[name], name).toBeDefined();
    }
  });

  it("gives both dark blocks the same declarations", () => {
    expect(SYSTEM_DARK).toEqual(PINNED_DARK);
  });
});

describe.each(THEMES)("%s palette", (_theme, t) => {
  const c = (token: string) => solid(t, token);

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
    ["text on a destructive fill", "--on-destructive", "--destructive"],
    ["text on a warn fill", "--on-destructive", "--warn"],
  ])("%s clears AA for text", (_label, fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(TEXT);
  });

  it.each([
    // The gold fill itself is only ~2.2:1 on the page, which is why the button
    // carries its own edge. It is the edge that has to clear 3:1, not the fill.
    ["button edge against the page", "--primary-edge", "--background"],
    ["button edge against a card", "--primary-edge", "--card"],
    ["focus ring against a card", "--ring", "--card"],
    ["focus ring against the page", "--ring", "--background"],
  ])("%s clears the 3:1 a control needs", (_label, fg, bg) => {
    expect(contrast(c(fg), c(bg))).toBeGreaterThanOrEqual(CONTROL);
  });

  it("keeps follow_up and converted in different colour families", () => {
    // They are the two statuses an admin acts on differently, and the brand
    // gold sits close to mustard — so this is the pair most at risk of merging.
    expect(hueDistance(c("--warn"), c("--success"))).toBeGreaterThan(25);
  });

  it("keeps follow_up clear of the gold", () => {
    // A gold button often sits above a column of À relancer rows. The light
    // mustard measures 14.6° in this (HSL) hue, which the docs round to 15°.
    expect(hueDistance(c("--warn"), c("--primary"))).toBeGreaterThanOrEqual(14.5);
  });
});

describe("rule 1: gold is never text on a light surface", () => {
  // Every colour DESIGN.md sets as text on the page, a card, secondary or a tint.
  const TEXT_ON_SURFACES = [
    "--foreground",
    "--muted-foreground",
    "--success",
    "--warn",
    "--destructive",
    "--outcome-interested",
  ];
  const SURFACES = ["--background", "--card", "--secondary"];

  it.each(THEMES)("%s: no text colour is the gold or its edge", (_theme, t) => {
    const golds = [solid(t, "--primary"), solid(t, "--primary-edge")];
    for (const token of TEXT_ON_SURFACES) {
      expect(golds, token).not.toContain(solid(t, token));
    }
  });

  it.each(THEMES)("%s: gold fails AA on every light surface", (_theme, t) => {
    // Recorded rather than aspired to: why gold is a fill. A dark theme has no
    // light surface, and its gold is legible on the band and the card alike.
    const gold = solid(t, "--primary");
    for (const surface of SURFACES.map((s) => solid(t, s))) {
      if (luminance(surface) > luminance(gold)) {
        expect(contrast(gold, surface), surface).toBeLessThan(TEXT);
      }
    }
  });
});

describe("rule 2: text on gold is navy, never white", () => {
  it.each(THEMES)("%s: the button label is darker than the gold and legible", (_theme, t) => {
    const [label, gold] = [solid(t, "--primary-foreground"), solid(t, "--primary")];
    expect(label).not.toBe("#ffffff");
    expect(luminance(label)).toBeLessThan(luminance(gold));
    expect(contrast(label, gold)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("rule 3: the focus ring is ink, never gold", () => {
  it("wires the ring utility to --ring, not to --primary", () => {
    // shadcn's default has ring follow primary; this is where that was broken.
    expect(THEME_INLINE["--color-ring"]).toBe("var(--ring)");
  });

  it.each(THEMES)("%s: the ring is the ink", (_theme, t) => {
    expect(solid(t, "--ring")).toBe(solid(t, "--foreground"));
    expect(solid(t, "--ring")).not.toBe(solid(t, "--primary"));
  });
});

describe("rule 4: every gold fill carries primary-edge", () => {
  it.each(THEMES)("%s: the edge is a gold that clears 3:1 where the fill does not", (_theme, t) => {
    const [gold, edge] = [solid(t, "--primary"), solid(t, "--primary-edge")];
    expect(edge).not.toBe(gold);
    // Still reads as gold: the same hue family, give or take a few degrees.
    expect(hueDistance(edge, gold)).toBeLessThan(10);
    for (const surface of ["--background", "--card"]) {
      expect(contrast(edge, solid(t, surface)), surface).toBeGreaterThanOrEqual(CONTROL);
    }
  });
});

describe("rule 5: status and outcome badge text reaches 4.5:1 on its tint", () => {
  // [badge, text colour, fill, the colour the fill must be a tint of]
  const BADGES: [string, string, string, string | null][] = [
    ["status new", "--muted-foreground", "--secondary", null],
    ["outcome no_contact", "--muted-foreground", "--secondary", null],
    ["status assigned", "--foreground", "--tint-assigned", "--foreground"],
    ["status follow_up", "--warn", "--tint-warn", "--warn"],
    ["status converted", "--success", "--tint-success", "--success"],
    ["status rejected", "--destructive", "--tint-destructive", "--destructive"],
    [
      "outcome interested",
      "--outcome-interested",
      "--tint-outcome-interested",
      "--outcome-interested",
    ],
    [
      "outcome not_interested",
      "--foreground",
      "--tint-outcome-not-interested",
      "--outcome-not-interested",
    ],
  ];

  describe.each(THEMES)("%s", (_theme, t) => {
    it.each(BADGES)("%s", (_badge, text, fill, tintOf) => {
      if (tintOf) {
        const recipe =
          /^color-mix\(in oklab, var\((--[a-z0-9-]+)\) (\d+(?:\.\d+)?)%, var\(--card\)\)$/.exec(
            t[fill] ?? "",
          );
        expect(recipe, `${fill} is not a color-mix into var(--card)`).not.toBeNull();
        expect(recipe?.[1], fill).toBe(tintOf);
        expect(Number(recipe?.[2]), `${fill} is mixed above 12 %`).toBeLessThanOrEqual(12);
      }
      expect(contrast(solid(t, text), solid(t, fill))).toBeGreaterThanOrEqual(TEXT);
    });
  });
});
