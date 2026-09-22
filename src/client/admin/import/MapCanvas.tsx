import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { copy } from "../../copy";
import { DEFAULT_CENTER, DEFAULT_ZOOM, isFull, type Vertex } from "./map";

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
 * `L.CircleMarker` for the handles rather than `L.Marker`: it needs no image,
 * which also sidesteps Leaflet's default icon URLs breaking under a bundler.
 */
export function MapCanvas({
  polygon,
  onAddVertex,
  onMoveVertex,
}: {
  polygon: Vertex[];
  onAddVertex: (vertex: Vertex) => void;
  onMoveVertex: (index: number, to: Vertex) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const shape = useRef<L.Polygon | null>(null);
  const handles = useRef<L.CircleMarker[]>([]);

  /**
   * The callbacks go through a ref so the map effect below can depend on
   * nothing and run exactly once. Without this, every parent render would tear
   * the map down and build it again.
   */
  const handlers = useRef({ onAddVertex, onMoveVertex, polygon });
  // Written in an effect, not during render: a ref assigned while rendering is
  // read by a concurrent render that never committed.
  useEffect(() => {
    handlers.current = { onAddVertex, onMoveVertex, polygon };
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
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: copy.attribution,
      maxZoom: 19,
    }).addTo(instance);

    instance.on("click", (event: L.LeafletMouseEvent) => {
      if (isFull(handlers.current.polygon)) return;
      handlers.current.onAddVertex([event.latlng.lat, event.latlng.lng]);
    });

    map.current = instance;

    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  // Redraw the shape and its handles whenever the polygon changes.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    shape.current?.remove();
    shape.current = null;
    for (const handle of handles.current) handle.remove();
    handles.current = [];

    if (polygon.length >= 2) {
      shape.current = L.polygon(polygon, {
        // Tokens, not hexes: read off the computed styles so the shape follows
        // the theme (including dark) without a second palette here.
        color: readToken("--color-ring"),
        fillColor: readToken("--color-primary"),
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(instance);
    }

    polygon.forEach((vertex, index) => {
      const handle = L.circleMarker(vertex, {
        radius: 7,
        color: readToken("--color-ring"),
        fillColor: readToken("--color-background"),
        fillOpacity: 1,
        weight: 2,
        // Leaflet's own keyboard support does not extend to dragging a vertex.
        // design.md records that, and names the CSV path as the way in.
        interactive: true,
      }).addTo(instance);

      handle.on("mousedown", () => {
        instance.dragging.disable();
        const move = (event: L.LeafletMouseEvent) => {
          handlers.current.onMoveVertex(index, [event.latlng.lat, event.latlng.lng]);
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
    });
  }, [polygon]);

  return (
    <div
      ref={container}
      // h-[28rem] is the one measurement here: a map needs a height to exist at
      // all, and it has no intrinsic one.
      className="border-border h-[28rem] w-full rounded-md border"
      // The canvas is a drawing surface, not a control. The vertex count and
      // the actions under it are what a screen reader is given.
      role="application"
      aria-label={copy.map.lede}
    />
  );
}

/** A `@theme` token's computed value, so Leaflet's inline styles stay on-palette. */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#1b2a4a";
}
