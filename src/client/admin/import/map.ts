/**
 * Shape drawing, without the map — docs/design.md, "The map import".
 *
 * A polygon for Overpass and a circle for Google, because Nearby Search has no
 * polygon search (ADR-0020). Both live here for the same reason: the rules are
 * testable and the canvas only draws them.
 *
 * Pure so it can be tested: there is no jsdom in this repo and no component is
 * ever rendered in a test, so the rules live here and `MapStep.tsx` only draws
 * them. Same arrangement as `csv.ts` beside the CSV importer.
 */
import {
  PLACES_RADIUS_MAX_M,
  PLACES_RADIUS_MIN_M,
  POLYGON_MAX_VERTICES,
  POLYGON_MIN_VERTICES,
} from "../../../shared/constants";
import { distanceMeters } from "../../../shared/geo";

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

/* ------------------------------------------------- circles, for Google (ADR-0020) */

/**
 * Nearby Search takes a centre and a radius in metres and nothing else, so the
 * Google provider draws a circle where Overpass draws a polygon.
 */
export type Circle = { center: Vertex; radius: number };

/** Where the resize handle sits: due east of the centre, at the radius. */
export const CIRCLE_EDGE_HANDLE = 1;
export const CIRCLE_CENTER_HANDLE = 0;

const toPoint = ([lat, lng]: Vertex) => ({ lat, lng });

/** The radius a first click gives you: small, because 20 results is the cap. */
export const CIRCLE_DEFAULT_RADIUS_M = 200;

export function clampRadius(radius: number): number {
  return Math.min(Math.max(Math.round(radius), PLACES_RADIUS_MIN_M), PLACES_RADIUS_MAX_M);
}

/** Metres between two points, reusing the same great circle the today list orders by. */
export function radiusBetween(center: Vertex, edge: Vertex): number {
  return clampRadius(distanceMeters(toPoint(center), toPoint(edge)));
}

/**
 * A click on the canvas, in circle mode.
 *
 * The first places the centre at a default radius rather than waiting for a
 * second click: a lone pin with no circle is a map that looks broken, and a
 * visible circle is something to drag. The second click sets the radius from
 * where it landed.
 */
export function clickCircle(circle: Circle | null, point: Vertex): Circle {
  if (!circle) return { center: point, radius: CIRCLE_DEFAULT_RADIUS_M };
  return { center: circle.center, radius: radiusBetween(circle.center, point) };
}

/**
 * Drag handle 0 to move the whole circle, handle 1 to resize it. Two handles
 * rather than dragging the shape itself, so the gesture matches the polygon's:
 * grab a dot, move it.
 */
export function moveCircleHandle(circle: Circle, index: number, to: Vertex): Circle {
  if (index === CIRCLE_CENTER_HANDLE) return { center: to, radius: circle.radius };
  if (index === CIRCLE_EDGE_HANDLE) {
    return { center: circle.center, radius: radiusBetween(circle.center, to) };
  }
  return circle;
}

/**
 * Due east of the centre at the radius. Derived rather than remembered: storing
 * where the admin last dragged would be a second source of truth for a number
 * the radius already holds.
 */
export function edgePoint({ center, radius }: Circle): Vertex {
  const [lat, lng] = center;
  const metresPerDegreeLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  // Guard the poles: cos(90°) is 0 and the handle would be at infinity.
  return [lat, lng + radius / Math.max(metresPerDegreeLng, 1)];
}

/** A circle Google will accept: a centre exists and the radius is in range. */
export function isSearchableCircle(circle: Circle | null): circle is Circle {
  return (
    circle !== null && circle.radius >= PLACES_RADIUS_MIN_M && circle.radius <= PLACES_RADIUS_MAX_M
  );
}
