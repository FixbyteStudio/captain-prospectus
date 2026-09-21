import { describe, expect, it } from "vitest";
import { editDistance, isProbablySamePlace, namesLookAlike, significantTokens } from "./similarity";

/** Around Place Bellecour, Lyon — the same coordinates the local seed uses. */
const HERE = { lat: 45.7578, lng: 4.832 };
/** Roughly 20 m north: inside the radius. */
const NEXT_DOOR = { lat: 45.75798, lng: 4.832 };
/** Roughly 200 m north: a different door. */
const DOWN_THE_STREET = { lat: 45.7596, lng: 4.832 };

describe("significantTokens", () => {
  it("drops the words every French restaurant shares", () => {
    // "bistrot" goes too: it says what kind of place it is, not which one.
    expect(significantTokens("Le Bistrot des Halles")).toEqual(["halles"]);
    expect(significantTokens("Chez Léa")).toEqual(["lea"]);
  });

  it("strips accents the same way the dedupe key does", () => {
    expect(significantTokens("Le Café Perché")).toEqual(["perche"]);
  });
});

describe("editDistance", () => {
  it("is zero for identical strings and counts single edits", () => {
    expect(editDistance("chez-lea", "chez-lea")).toBe(0);
    expect(editDistance("chez-lea", "chez-leo")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("namesLookAlike", () => {
  it("matches a name that gained words", () => {
    expect(namesLookAlike("Chez Léa", "Chez Léa et Paul")).toBe(true);
  });

  it("matches a corrected accent or spelling", () => {
    expect(namesLookAlike("Chez Léa", "Chez Lea")).toBe(true);
    expect(namesLookAlike("Brasserie du Rhône", "Brasserie du Rhone")).toBe(true);
  });

  it("does not match two different businesses", () => {
    expect(namesLookAlike("Chez Léa", "Burger King")).toBe(false);
  });

  it("does not match on a shared filler word alone", () => {
    // The whole reason STOPWORDS exists: these share "le", and nothing else.
    expect(namesLookAlike("Le Bistrot", "Le Bar")).toBe(false);
    expect(namesLookAlike("Café de la Gare", "Bar de la Gare")).toBe(true);
  });

  it("does not match two businesses that share only what they sell", () => {
    // Found by running the sweep against real data: these were proposed as the
    // same place 33 m apart because both are called "Pizza something".
    expect(namesLookAlike("Pizza Roma", "Pizza Vecchia")).toBe(false);
    expect(namesLookAlike("Sushi Bellecour", "Sushi Croix-Rousse")).toBe(false);
    expect(namesLookAlike("Burger Truck 69", "Burger Fourvière")).toBe(false);
    // But the same pizzeria under a corrected name still matches.
    expect(namesLookAlike("Pizza Roma", "Pizza Roma Bellecour")).toBe(true);
  });
});

describe("isProbablySamePlace", () => {
  it("proposes a renamed prospect at the same address", () => {
    expect(
      isProbablySamePlace(
        { name: "Chez Léa", ...HERE },
        { name: "Chez Léa et Paul", ...NEXT_DOOR },
      ),
    ).toBe(true);
  });

  it("does not propose a takeover, however close it is", () => {
    // A restaurant that closed and was replaced looks exactly like a rename in
    // the data. The name is the only thing that separates them.
    expect(
      isProbablySamePlace({ name: "Chez Léa", ...HERE }, { name: "Burger King", ...HERE }),
    ).toBe(false);
  });

  it("does not propose the same chain two streets apart", () => {
    expect(
      isProbablySamePlace(
        { name: "Pizza Roma", ...HERE },
        { name: "Pizza Roma", ...DOWN_THE_STREET },
      ),
    ).toBe(false);
  });

  it("falls back to an exact name when either side has no coordinates", () => {
    const unlocated = { name: "La Cantine Mobile", lat: null, lng: null };
    expect(isProbablySamePlace(unlocated, { name: "La Cantine Mobile", ...HERE })).toBe(true);
    // Without a location, a near-miss is not evidence enough.
    expect(isProbablySamePlace(unlocated, { name: "La Cantine Mobile 2", ...HERE })).toBe(false);
  });

  it("never proposes a pair of nameless rows", () => {
    expect(
      isProbablySamePlace({ name: "", lat: null, lng: null }, { name: "", lat: null, lng: null }),
    ).toBe(false);
  });
});
