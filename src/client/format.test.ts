import { describe, expect, it } from "vitest";
import {
  deltaTone,
  formatCount,
  formatDay,
  formatDayTick,
  formatDelta,
  formatPercent,
  formatPoints,
  initials,
} from "./format";

describe("initials", () => {
  it("takes the first letter of the first two dot-separated parts", () => {
    expect(initials("laura.verhoeven@example.com")).toBe("LV");
  });

  it("also splits on underscore, hyphen and plus", () => {
    expect(initials("jean_pierre@example.com")).toBe("JP");
    expect(initials("anne-marie@example.com")).toBe("AM");
    expect(initials("jane+tag@example.com")).toBe("JT");
  });

  it("falls back to the first two letters of a one-part local name", () => {
    expect(initials("fixbyte@example.com")).toBe("FI");
  });

  it("uppercases the result", () => {
    expect(initials("bob@example.com")).toBe("BO");
    expect(initials("a.b@example.com")).toBe("AB");
  });

  it("drops a leading separator instead of initialing an empty part", () => {
    expect(initials("_admin@example.com")).toBe("AD");
  });

  it("counts letters only, ignoring digits within a part", () => {
    expect(initials("a1.b2@example.com")).toBe("AB");
  });

  it("falls back to '?' when the local part has no letters at all", () => {
    expect(initials("123@example.com")).toBe("?");
  });

  it("falls back to '?' for an empty local part", () => {
    expect(initials("@example.com")).toBe("?");
  });

  it("counts an accented letter, not just a-z", () => {
    expect(initials("élodie.dupont@example.com")).toBe("ÉD");
  });

  it("drops a numeric part entirely instead of pairing it with the next one", () => {
    expect(initials("1.john@example.com")).toBe("JO");
  });
});

describe("formatDelta", () => {
  it.each([
    [0.124, "+12,4\u00a0%"],
    [-0.03, "\u22123,0\u00a0%"],
    [0, "0,0\u00a0%"],
    [null, "—"],
    [2.5, "+250,0\u00a0%"],
    [-1, "\u2212100,0\u00a0%"],
  ])("formatDelta(%s) -> %s", (delta, expected) => {
    expect(formatDelta(delta)).toBe(expected);
  });

  it("rounds half-tenths away from zero, the same both ways", () => {
    expect(formatDelta(0.0005)).toBe("+0,1\u00a0%");
    expect(formatDelta(-0.0005)).toBe("\u22120,1\u00a0%");
    expect(formatDelta(0.0125)).toBe("+1,3\u00a0%");
    expect(formatDelta(-0.0125)).toBe("\u22121,3\u00a0%");
  });

  it("drops the sign of a delta too small to show", () => {
    expect(formatDelta(0.0004)).toBe("0,0\u00a0%");
    expect(formatDelta(-0.0004)).toBe("0,0\u00a0%");
  });
});

describe("deltaTone", () => {
  it.each([
    [0.124, "up"],
    [-0.03, "down"],
    [0, "flat"],
    [null, "flat"],
    // Rounds to "0,0 %", so no arrow either way.
    [0.0004, "flat"],
    [-0.0004, "flat"],
    // Half a tenth rounds away from zero, symmetrically.
    [0.0005, "up"],
    [-0.0005, "down"],
    [0.0125, "up"],
    [-0.0125, "down"],
  ] as const)("deltaTone(%s) -> %s", (delta, expected) => {
    expect(deltaTone(delta)).toBe(expected);
  });
});

describe("formatCount", () => {
  it("groups thousands the French way", () => {
    expect(formatCount(386)).toBe("386");
    // fr-FR groups with a narrow no-break space.
    expect(formatCount(1284)).toBe("1\u202f284");
  });
});

describe("formatPercent", () => {
  it.each([
    [0.25, "25,0\u00a0%"],
    [0.106, "10,6\u00a0%"],
    [0, "0,0\u00a0%"],
    [1, "100,0\u00a0%"],
    // A manual conversion without a visit can push it past 100 %.
    [1.5, "150,0\u00a0%"],
    [null, "—"],
  ])("formatPercent(%s) -> %s", (ratio, expected) => {
    expect(formatPercent(ratio)).toBe(expected);
  });

  it("rounds half-tenths up, as formatDelta does", () => {
    expect(formatPercent(0.0005)).toBe("0,1\u00a0%");
    expect(formatPercent(0.0004)).toBe("0,0\u00a0%");
    expect(formatPercent(0.1255)).toBe("12,6\u00a0%");
  });
});

describe("formatPoints", () => {
  it.each([
    [0.012, "+1,2\u00a0pt"],
    [-0.004, "\u22120,4\u00a0pt"],
    [0, "0,0\u00a0pt"],
    [null, "—"],
    // 0.25 − 0.2 in floating point is 0.04999…, still +5,0 pt.
    [0.25 - 0.2, "+5,0\u00a0pt"],
  ])("formatPoints(%s) -> %s", (delta, expected) => {
    expect(formatPoints(delta)).toBe(expected);
  });

  it("rounds half-tenths away from zero and drops the sign of a zero", () => {
    expect(formatPoints(0.0005)).toBe("+0,1\u00a0pt");
    expect(formatPoints(-0.0005)).toBe("\u22120,1\u00a0pt");
    expect(formatPoints(0.0004)).toBe("0,0\u00a0pt");
    expect(formatPoints(-0.0004)).toBe("0,0\u00a0pt");
  });
});

describe("formatDayTick and formatDay (GH #110)", () => {
  it("reads a Brussels date as that date, in fr-FR", () => {
    expect(formatDayTick("2026-09-21", true)).toBe("lun. 21");
    expect(formatDayTick("2026-09-21", false)).toBe("21/09");
    expect(formatDay("2026-09-21")).toBe("lundi 21 septembre");
    // New Year's Day stays on 1 January, whatever the machine's zone.
    expect(formatDayTick("2026-01-01", false)).toBe("01/01");
  });
});
