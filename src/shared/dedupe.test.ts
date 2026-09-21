import { describe, expect, it } from "vitest";
import { dedupeKey, normalize } from "./dedupe";

/**
 * A wrong key either duplicates a prospect on every re-import or merges two
 * real businesses into one. Both are visible to the agent on the street.
 * Rules: docs/domains/prospecting.md.
 */
describe("normalize", () => {
  it("strips accents, lowercases and collapses punctuation", () => {
    expect(normalize("Chez Léa — Crêperie!")).toBe("chez-lea-creperie");
    expect(normalize("  L'Ébène  ")).toBe("l-ebene");
  });

  it("makes accent and case differences disappear", () => {
    expect(normalize("CAFÉ DU MARCHÉ")).toBe(normalize("café du marché"));
  });
});

describe("dedupeKey", () => {
  it("prefers a stable source reference", () => {
    expect(dedupeKey({ name: "Le Bistrot", sourceRef: "node/123", lat: 1, lng: 2 })).toBe(
      "ref:node/123",
    );
  });

  it("falls back to a ~110 m geographic cell", () => {
    expect(dedupeKey({ name: "Le Bistrot", lat: 48.85661, lng: 2.35222 })).toBe(
      "geo:le-bistrot:48.857:2.352",
    );
  });

  it("merges two imports of the same place within the same cell", () => {
    const a = dedupeKey({ name: "Le Bistrot", lat: 48.8566, lng: 2.3522 });
    const b = dedupeKey({ name: "LE BISTROT", lat: 48.8566, lng: 2.3522 });
    expect(a).toBe(b);
  });

  it("keeps two different businesses in the same cell apart", () => {
    const a = dedupeKey({ name: "Le Bistrot", lat: 48.8566, lng: 2.3522 });
    const b = dedupeKey({ name: "Pizza Roma", lat: 48.8566, lng: 2.3522 });
    expect(a).not.toBe(b);
  });

  it("uses the address when there are no coordinates", () => {
    expect(dedupeKey({ name: "Le Bistrot", address: "12 Rue de la Paix" })).toBe(
      "addr:le-bistrot:12-rue-de-la-paix",
    );
  });

  it("falls back to the name alone rather than producing a colliding empty key", () => {
    expect(dedupeKey({ name: "Le Bistrot" })).toBe("name:le-bistrot");
    expect(dedupeKey({ name: "Pizza Roma" })).not.toBe(dedupeKey({ name: "Le Bistrot" }));
  });
});
