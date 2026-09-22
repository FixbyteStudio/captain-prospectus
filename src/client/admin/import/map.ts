/**
 * Polygon drawing, without the map — docs/design.md, "The map import".
 *
 * Pure so it can be tested: there is no jsdom in this repo and no component is
 * ever rendered in a test, so the rules live here and `MapStep.tsx` only draws
 * them. Same arrangement as `csv.ts` beside the CSV importer.
 */
import { POLYGON_MAX_VERTICES, POLYGON_MIN_VERTICES } from "../../../shared/constants";

/** `[lat, lng]`, the order the wire contract and Overpass both use. */
export type Vertex = [number, number];

/**
 * Lyon, where this is first used. Only a starting view — the admin pans away
 * immediately, and nothing downstream depends on it.
 */
export const DEFAULT_CENTER: Vertex = [45.764, 4.8357];
export const DEFAULT_ZOOM = 14;

export function addVertex(polygon: readonly Vertex[], vertex: Vertex): Vertex[] {
  // Silently ignoring the click past the cap would look like a broken map, so
  // the caller disables the canvas instead; this is the backstop.
  if (polygon.length >= POLYGON_MAX_VERTICES) return [...polygon];
  return [...polygon, vertex];
}

export function moveVertex(polygon: readonly Vertex[], index: number, to: Vertex): Vertex[] {
  if (index < 0 || index >= polygon.length) return [...polygon];
  return polygon.map((vertex, i) => (i === index ? to : vertex));
}

export function removeLastVertex(polygon: readonly Vertex[]): Vertex[] {
  return polygon.slice(0, -1);
}

/** Enough vertices to be an area Overpass will accept (ingestion.md: 3–200). */
export function isSearchable(polygon: readonly Vertex[]): boolean {
  return polygon.length >= POLYGON_MIN_VERTICES && polygon.length <= POLYGON_MAX_VERTICES;
}

export function isFull(polygon: readonly Vertex[]): boolean {
  return polygon.length >= POLYGON_MAX_VERTICES;
}
