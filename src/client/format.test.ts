import { describe, expect, it } from "vitest";
import { initials } from "./format";

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
