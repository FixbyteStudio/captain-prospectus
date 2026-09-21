/**
 * "Are these two rows the same place?" — docs/domains/prospecting.md.
 *
 * The dedupe key cannot answer this, because tiers 2 and 3 are built from the
 * name: rename a prospect and it gets a new key and a new row. This module
 * finds those pairs again so an admin can merge them by hand.
 *
 * It only ever *proposes*. A rename and a takeover — a restaurant closing and a
 * new one opening at the same address — look identical in the data, and only a
 * person can tell them apart.
 */
import { distanceMeters } from "./geo";
import type { Point } from "./geo";
import { normalize } from "./dedupe";

/** Beyond this, two rows are neighbours, not the same door. */
export const SAME_PLACE_RADIUS_M = 50;

/** An edit distance up to this share of the longer name still reads as a typo. */
const MAX_EDIT_RATIO = 0.25;

/**
 * Words that carry no identity in a French restaurant list. Without this,
 * "Le Bistrot" and "Le Bar" share a token and every café matches every other.
 */
const STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "du",
  "de",
  "des",
  "d",
  "au",
  "aux",
  "a",
  "et",
  "chez",
  // Venue types.
  "restaurant",
  "resto",
  "cafe",
  "bar",
  "brasserie",
  "bistro",
  "bistrot",
  "taverne",
  "auberge",
  "snack",
  "food",
  "truck",
  "cantine",
  // What they sell. As generic as the venue type: two unrelated pizzerias forty
  // metres apart are not the same place, and "pizza" is all they have in common.
  "pizza",
  "pizzeria",
  "sushi",
  "burger",
  "kebab",
  "tacos",
  "creperie",
  "crepes",
  "boulangerie",
  "patisserie",
  "glacier",
  "traiteur",
  "grill",
]);

export type SamePlaceInput = {
  name: string;
  lat: number | null;
  lng: number | null;
};

/** Meaningful words of a name, accent-stripped and lowercased. */
export function significantTokens(name: string): string[] {
  return normalize(name)
    .split("-")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/**
 * Levenshtein distance, two rows at a time.
 *
 * Names are short and bounded to 200 characters by the schema, so the quadratic
 * cost is fine — but this runs inside the Workers Free 10 ms CPU budget over
 * many pairs, hence the single rolling row rather than a full matrix.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[b.length] ?? 0;
}

/** Close enough to be the same business under a corrected or extended name. */
export function namesLookAlike(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;

  // "Chez Léa" -> "Chez Léa et Paul": the identifying word survives.
  const leftTokens = significantTokens(a);
  const rightTokens = significantTokens(b);
  if (leftTokens.some((token) => rightTokens.includes(token))) return true;

  // "Chez Léa" -> "Chez Lea": a typo, not a different place.
  const longest = Math.max(left.length, right.length);
  return editDistance(left, right) <= Math.floor(longest * MAX_EDIT_RATIO);
}

/**
 * Two prospects that are probably one place.
 *
 * Both located: within 50 m *and* alike by name. Either one unlocated: the name
 * alone has to carry it, and only an exact normalised match counts — a 110 m
 * cell is a guess, but no cell at all is a coin toss.
 */
function located<T extends SamePlaceInput>(item: T): item is T & Point {
  return typeof item.lat === "number" && typeof item.lng === "number";
}

export function isProbablySamePlace(a: SamePlaceInput, b: SamePlaceInput): boolean {
  if (!located(a) || !located(b)) {
    const name = normalize(a.name);
    return name.length > 0 && name === normalize(b.name);
  }

  return distanceMeters(a, b) <= SAME_PLACE_RADIUS_M && namesLookAlike(a.name, b.name);
}
