/**
 * The shared Leaflet map — docs/design.md, "Carte" (spec-gh-121).
 *
 * Same imperative pattern as `MapCanvas` (admin/import/MapCanvas.tsx): the map
 * is created once in an effect and driven by refs from then on, because
 * re-rendering it on every prop change is how a map loses its pan position
 * mid-gesture. React owns nothing inside the container.
 *
 * Shared with the visit's tablet pane (story 117.9) and the admin round view
 * (epic-117 context) — a lazy chunk both sides import, so Leaflet is never
 * duplicated and never sits in the entry chunk.
 *
 * `CarteScreen` decides when this exists at all: it is never mounted offline,
 * because Leaflet requests a tile on every pan, and "no tile request offline"
 * only holds when there is no map to pan.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixedIcon } from "lucide-react";
import { copy } from "../copy";
import { Button } from "@/ui/button";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../admin/import/map";
import type { Point } from "../../shared/geo";
import type { MapPin } from "./round-map";

/** A single known point (no pins, or one pin with no position) gets a walking
 * zoom rather than `fitBounds`, which has nothing to fit around one point. */
const POINT_ZOOM = 16;

/**
 * Matches `useAgentPosition`'s own `getCurrentPosition` timeout: past this, a
 * re-centre tap that got no fresh reading (denied, or genuinely no signal)
 * falls back to fitting the pins and whatever position is still known
 * (spec-gh-121 matrix, "Re-centre").
 */
const RECENTRE_TIMEOUT_MS = 10_000;

// Tailwind v4 scans literal class strings in source (Design Notes), so these
// are whole, not built from a template — a `bg-${x}` string would be invisible
// to it and ship unstyled.
const GOLD_PIN =
  "tnum flex size-8.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-1 ring-inset ring-primary-edge text-[15px] font-bold shadow";
const CARD_PIN =
  "tnum flex size-7 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-inset ring-border text-[13px] font-bold shadow";
const POSITION_DOT =
  '<span class="flex size-6 items-center justify-center rounded-full bg-foreground/20"><span class="size-3 rounded-full bg-foreground ring-2 ring-card"></span></span>';

function pinIcon(pin: MapPin): L.DivIcon {
  const size = pin.next ? 34 : 28;
  return L.divIcon({
    className: "",
    html: `<span class="${pin.next ? GOLD_PIN : CARD_PIN}">${pin.index}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const POSITION_ICON = L.divIcon({
  className: "",
  html: POSITION_DOT,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/** A `@theme` token's computed value, so the dashed path follows the theme
 * (including dark) without a second palette here — MapCanvas's own
 * `readToken`. Leaflet's vector layers take a CSS colour string, not a class,
 * which is the one place this component cannot just reach for Tailwind. */
function readToken(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#c9a227";
}

/** A stable key for "which points would we fit to", so the auto-fit effect can
 * tell a genuinely new round from a re-render that changed nothing it draws. */
function pointsKey(points: readonly [number, number][]): string {
  return JSON.stringify(points);
}

function fitToPoints(instance: L.Map, points: readonly [number, number][]): void {
  const [only] = points;
  if (points.length === 0 || !only) instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  else if (points.length === 1) instance.setView(only, POINT_ZOOM);
  // `maxZoom`: several pins at (near-)identical coordinates would otherwise
  // zoom to Leaflet's default max (19) instead of a sane walking-order view.
  else instance.fitBounds(points as [number, number][], { padding: [40, 40], maxZoom: POINT_ZOOM });
}

export function RoundMap({
  pins,
  path,
  position,
  recentre,
}: {
  pins: readonly MapPin[];
  path: readonly [number, number][];
  position: Point | null;
  /** Asks the caller for a fresh reading (`useAgentPosition`'s own `refresh`,
   * passed through by `CarteScreen`). */
  recentre: () => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pathLine = useRef<L.Polyline | null>(null);
  const recentreTimer = useRef<number | null>(null);
  /** Set from the moment a re-centre tap asks for a fresh reading until one
   * actually lands (never by the 10 s fallback firing, which only covers the
   * view while the reading is still in flight — see `handleRecentre`). */
  const pendingRecentre = useRef(false);
  /** True for the duration of a move this component started itself
   * (`fitToPoints`/`panTo`), so the `movestart` listener below can tell that
   * apart from the agent's own hand on the map. Held until `moveend`, not
   * cleared right after the call, because an animated move fires its own
   * `movestart` asynchronously — clearing any earlier would let that async
   * event look like a hand move. */
  const programmaticMove = useRef(false);
  /** The last point set this component fitted to on its own (see
   * `pointsKey`). Auto-fit keeps following the round — a sync landing new
   * coordinates, a position arriving — until the agent's own hand moves the
   * map; after that, only an explicit re-centre tap moves it again. */
  const lastFitKey = useRef<string | null>(null);
  const userMoved = useRef(false);

  // The latest pins and position, read from the re-centre timeout below
  // without making that effect re-subscribe on every redraw.
  const latestPins = useRef(pins);
  const latestPosition = useRef(position);
  useEffect(() => {
    latestPins.current = pins;
    latestPosition.current = position;
  });

  useEffect(() => {
    const element = container.current;
    if (!element || map.current) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instance = L.map(element, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    });

    // INVARIANT 11: attribution on every map, fed to the tile layer so it
    // cannot be laid out away. `setPrefix(false)` drops Leaflet's own credit
    // link, not ours — `copy.attribution` still shows.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: copy.attribution,
      maxZoom: 19,
    }).addTo(instance);
    instance.attributionControl.setPrefix(false);

    // Tells a hand move from one of ours: `movestart` fires the instant either
    // kind starts, `programmaticMove` is only true while ours is in flight.
    instance.on("movestart", () => {
      if (!programmaticMove.current) userMoved.current = true;
    });
    instance.on("moveend", () => {
      programmaticMove.current = false;
    });

    markers.current = L.layerGroup().addTo(instance);
    map.current = instance;

    return () => {
      if (recentreTimer.current !== null) window.clearTimeout(recentreTimer.current);
      recentreTimer.current = null;
      pendingRecentre.current = false;
      programmaticMove.current = false;
      userMoved.current = false;
      lastFitKey.current = null;
      instance.remove();
      map.current = null;
      markers.current = null;
      pathLine.current = null;
    };
  }, []);

  // Redraws the pins, the path and the position dot whenever any of them
  // changes, and auto-fits the view to them — but only while the agent has
  // not yet taken the map into their own hands, and only when the round
  // actually changed (`lastFitKey`), so a re-render that redraws the same
  // pins does not reset a pan already in progress.
  useEffect(() => {
    const instance = map.current;
    const layer = markers.current;
    if (!instance || !layer) return;

    layer.clearLayers();
    pathLine.current?.remove();
    pathLine.current = null;

    // No pin-tap selection yet (story 117.5): every marker is decorative.
    for (const pin of pins) {
      L.marker([pin.lat, pin.lng], { icon: pinIcon(pin), interactive: false }).addTo(layer);
    }
    if (path.length >= 2) {
      pathLine.current = L.polyline(path as [number, number][], {
        color: readToken("--color-primary"),
        weight: 3,
        dashArray: "7 6",
      }).addTo(instance);
    }
    if (position) {
      L.marker([position.lat, position.lng], { icon: POSITION_ICON, interactive: false }).addTo(
        layer,
      );
    }

    if (!userMoved.current) {
      const points: [number, number][] = pins.map((pin): [number, number] => [pin.lat, pin.lng]);
      if (position) points.push([position.lat, position.lng]);
      const key = pointsKey(points);
      if (key !== lastFitKey.current) {
        lastFitKey.current = key;
        programmaticMove.current = true;
        fitToPoints(instance, points);
      }
    }
  }, [pins, path, position]);

  // A re-centre tap asks for a fresh reading (`handleRecentre` below); when it
  // lands here as a prop change, pan straight to it. `useAgentPosition` never
  // updates on its own (no `watchPosition`, by design), so a position change
  // while a tap is pending only ever means "the agent's ask landed" — and
  // `pendingRecentre` stays set (rather than clearing when the 10 s fallback
  // merely fires) so a reading that lands late still pans.
  useEffect(() => {
    if (!pendingRecentre.current) return;
    const instance = map.current;
    if (!instance || !position) return;

    pendingRecentre.current = false;
    if (recentreTimer.current !== null) {
      window.clearTimeout(recentreTimer.current);
      recentreTimer.current = null;
    }
    programmaticMove.current = true;
    instance.panTo([position.lat, position.lng]);
  }, [position]);

  const handleRecentre = () => {
    recentre();
    pendingRecentre.current = true;
    if (recentreTimer.current !== null) window.clearTimeout(recentreTimer.current);

    if (!position) {
      // Nothing to ask again from — fit the pins right away so the tap does
      // not look like it did nothing while a fresh reading is still in
      // flight (spec-gh-121 matrix, "without a position, fits the pins").
      // `pendingRecentre` stays true: a reading that lands after this still
      // pans, via the effect above.
      const instance = map.current;
      if (instance) {
        programmaticMove.current = true;
        fitToPoints(
          instance,
          latestPins.current.map((pin): [number, number] => [pin.lat, pin.lng]),
        );
      }
    }

    // The fallback, armed on every tap: if no fresh reading lands within
    // `useAgentPosition`'s own geolocation timeout, fit the pins *and*
    // whatever position is still known — never the pins alone, which would
    // drop a perfectly good (if stale) position back to the Brussels default.
    recentreTimer.current = window.setTimeout(() => {
      recentreTimer.current = null;
      const instance = map.current;
      if (!instance) return;
      const points: [number, number][] = latestPins.current.map((pin): [number, number] => [
        pin.lat,
        pin.lng,
      ]);
      if (latestPosition.current) {
        points.push([latestPosition.current.lat, latestPosition.current.lng]);
      }
      programmaticMove.current = true;
      fitToPoints(instance, points);
    }, RECENTRE_TIMEOUT_MS);
  };

  return (
    <div className="relative size-full">
      <div
        ref={container}
        // `isolate`: without it, Leaflet's own panes (z-index 200-700) join
        // this element's *parent* stacking context instead of staying
        // contained in their own, and paint over the re-centre button and
        // (from `CarteScreen`) the position-denied card, which are both
        // ordinary siblings with no z-index of their own to out-rank them.
        className="size-full isolate"
        // A drawing surface, not a control — MapCanvas's own choice.
        role="application"
        aria-label={copy.carte.label}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-map"
        onClick={handleRecentre}
        aria-label={copy.carte.recentre}
        // `z-10`: above the isolated map div as a whole (see `isolate` above).
        // `bottom-9` clears Leaflet's own bottom-right attribution line so
        // neither paints over the other.
        className="bg-card absolute right-3.5 bottom-9 z-10 shadow-md"
      >
        <LocateFixedIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
