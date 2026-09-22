import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { copy } from "../../copy";
import {
  CIRCLE_CENTER_HANDLE,
  CIRCLE_EDGE_HANDLE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  edgePoint,
  isFull,
  type Circle,
  type Vertex,
} from "./map";

/** Which shape the canvas draws — a polygon for Overpass, a circle for Google. */
export type DrawMode = "polygon" | "circle";

/**
 * The Leaflet canvas, and nothing else — docs/design.md, "The map import".
 *
 * Leaflet owns this element and React owns nothing inside it, which is why the
 * map is created once in an effect and then driven imperatively. Re-rendering a
 * map on every state change is how you get a canvas that flickers and loses the
 * pan position mid-drag.
 *
 * Drawing is click-to-place. No draw plugin: it would be ~60 kB gzipped for a
 * toolbar we would then have to restyle and translate, against ~80 lines here
 * (ADR-0008 asks for a polygon, not for a particular way of drawing one).
 *
 * The canvas knows the shape but not the rules. A click and a handle drag are
 * reported as they happened and `map.ts` decides what they mean, so the two
 * providers' geometry stays pure and tested (ADR-0020).
 *
 * `L.CircleMarker` for the handles rather than `L.Marker`: it needs no image,
 * which also sidesteps Leaflet's default icon URLs breaking under a bundler.
 */
export function MapCanvas({
  mode,
  polygon,
  circle,
  onMapClick,
  onHandleDrag,
}: {
  mode: DrawMode;
  polygon: Vertex[];
  circle: Circle | null;
  onMapClick: (point: Vertex) => void;
  onHandleDrag: (index: number, to: Vertex) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const shape = useRef<L.Polygon | L.Circle | null>(null);
  const handles = useRef<L.CircleMarker[]>([]);

  /**
   * The callbacks go through a ref so the map effect below can depend on
   * nothing and run exactly once. Without this, every parent render would tear
   * the map down and build it again.
   */
  const handlers = useRef({ mode, polygon, onMapClick, onHandleDrag });
  // Written in an effect, not during render: a ref assigned while rendering is
  // read by a concurrent render that never committed.
  useEffect(() => {
    handlers.current = { mode, polygon, onMapClick, onHandleDrag };
  });

  useEffect(() => {
    const element = container.current;
    if (!element || map.current) return;

    // design.md principle 5 and the reduced-motion block in app.css: motion
    // only where something changed. A pan that animates is decoration here.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const instance = L.map(element, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    });

    // INVARIANT 11: attribution on every map. Passing it to the tile layer
    // rather than drawing our own line means it cannot be laid out away.
    // The tiles are OSM whichever provider is searched (ADR-0020).
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: copy.attribution,
      maxZoom: 19,
    }).addTo(instance);

    instance.on("click", (event: L.LeafletMouseEvent) => {
      const current = handlers.current;
      // A full polygon must stop accepting clicks; a circle has no such cap,
      // because its second click is what sets the radius.
      if (current.mode === "polygon" && isFull(current.polygon)) return;
      current.onMapClick([event.latlng.lat, event.latlng.lng]);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // Redraw the shape and its handles whenever what is drawn changes.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    shape.current?.remove();
    shape.current = null;
    for (const handle of handles.current) handle.remove();
    handles.current = [];

    // Tokens, not hexes: read off the computed styles so the shape follows the
    // theme (including dark) without a second palette here.
    const stroke = { color: readToken("--color-ring"), weight: 2 };
    const fill = { fillColor: readToken("--color-primary"), fillOpacity: 0.18 };

    const addHandle = (at: Vertex, index: number) => {
      const handle = L.circleMarker(at, {
        radius: 7,
        color: readToken("--color-ring"),
        fillColor: readToken("--color-background"),
        fillOpacity: 1,
        weight: 2,
        // Leaflet's own keyboard support does not extend to dragging a handle.
        // design.md records that, and names the CSV path as the way in.
        interactive: true,
      }).addTo(instance);

      handle.on("mousedown", () => {
        instance.dragging.disable();
        const move = (event: L.LeafletMouseEvent) => {
          handlers.current.onHandleDrag(index, [event.latlng.lat, event.latlng.lng]);
        };
        const stop = () => {
          instance.off("mousemove", move);
          instance.off("mouseup", stop);
          instance.dragging.enable();
        };
        instance.on("mousemove", move);
        instance.on("mouseup", stop);
      });

      handles.current.push(handle);
    };

    if (mode === "circle") {
      if (!circle) return;
      shape.current = L.circle(circle.center, { radius: circle.radius, ...stroke, ...fill }).addTo(
        instance,
      );
      // Two handles: the centre moves the circle, the eastern one resizes it.
      addHandle(circle.center, CIRCLE_CENTER_HANDLE);
      addHandle(edgePoint(circle), CIRCLE_EDGE_HANDLE);
      return;
    }

    if (polygon.length >= 2) {
      shape.current = L.polygon(polygon, { ...stroke, ...fill }).addTo(instance);
    }
    polygon.forEach((vertex, index) => addHandle(vertex, index));
  }, [mode, polygon, circle]);

  return (
    <div
      ref={container}
      // h-[28rem] is the one measurement here: a map needs a height to exist at
      // all, and it has no intrinsic one.
      className="border-border h-[28rem] w-full rounded-md border"
      // The canvas is a drawing surface, not a control. The shape's size and
      // the actions under it are what a screen reader is given.
      role="application"
      aria-label={mode === "circle" ? copy.map.circle.lede : copy.map.lede}
    />
  );
}

/** A `@theme` token's computed value, so Leaflet's inline styles stay on-palette. */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#1b2a4a";
}
