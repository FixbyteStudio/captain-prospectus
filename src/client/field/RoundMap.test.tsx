/**
 * RoundMap — spec-gh-121 matrix, "Online round" and "Re-centre". Real Leaflet
 * in happy-dom (spiked first: it creates a map, draws markers, an SVG
 * polyline and an attribution control with no network request, so a fake
 * standing in for it would prove less than the real thing does here) —
 * `vi.mock("./RoundMap")` is what `CarteScreen.test.tsx` does instead.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import L from "leaflet";
import { copy } from "../copy";
import type { MapPin } from "./round-map";
import { RoundMap } from "./RoundMap";

/** Matches `RECENTRE_TIMEOUT_MS` in `RoundMap.tsx` — not exported, since
 * nothing outside the module needs it; the fake-timer tests below advance by
 * this literal instead. */
const RECENTRE_TIMEOUT_MS = 10_000;

const pin = (over: Partial<MapPin> = {}): MapPin => ({
  id: crypto.randomUUID(),
  index: 1,
  lat: 50.85,
  lng: 4.35,
  next: false,
  ...over,
});

function markerIcons(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".leaflet-marker-icon"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RoundMap", () => {
  it("draws one marker per pin: gold 34px only for `next`, card 28px for the rest", () => {
    const pins = [
      pin({ index: 1, lat: 1, lng: 2, next: true }),
      pin({ index: 2, lat: 3, lng: 4, next: false }),
    ];
    const { container } = render(
      <RoundMap pins={pins} path={[]} position={null} recentre={() => {}} />,
    );

    const markers = markerIcons(container);
    expect(markers).toHaveLength(2);

    const gold = markers.find((el) => el.textContent === "1");
    const card = markers.find((el) => el.textContent === "2");
    expect(gold?.querySelector("span")?.className).toContain("bg-primary");
    expect(gold?.style.width).toBe("34px");
    expect(card?.querySelector("span")?.className).toContain("bg-card");
    expect(card?.style.width).toBe("28px");
  });

  it("draws the dashed gold path through the stops", () => {
    const { container } = render(
      <RoundMap
        pins={[pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })]}
        path={[
          [1, 2],
          [3, 4],
        ]}
        position={null}
        recentre={() => {}}
      />,
    );

    const path = container.querySelector("path.leaflet-interactive");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(path?.getAttribute("stroke-dasharray")).toBe("7 6");
  });

  it("draws a position marker only when a position is given", () => {
    const { container: withoutPosition } = render(
      <RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />,
    );
    expect(markerIcons(withoutPosition)).toHaveLength(0);

    const { container: withPosition } = render(
      <RoundMap pins={[]} path={[]} position={{ lat: 5, lng: 6 }} recentre={() => {}} />,
    );
    const markers = markerIcons(withPosition);
    expect(markers).toHaveLength(1);
    expect(markers.at(0)?.innerHTML).toContain("bg-foreground/20");
  });

  it("shows the OSM attribution with Leaflet's own prefix dropped", () => {
    const { container } = render(
      <RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />,
    );

    const attribution = container.querySelector(".leaflet-control-attribution");
    // Leaflet's default prefix is a "Leaflet" credit link; `setPrefix(false)`
    // drops it, so only `copy.attribution` remains — a stray prefix here would
    // be invariant 11's OSM line sharing its home with an uncredited "Leaflet".
    expect(attribution?.textContent).toBe(copy.attribution);
  });

  it("tiles from OpenStreetMap", () => {
    const tileLayer = vi.spyOn(L, "tileLayer");

    render(<RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />);

    expect(tileLayer).toHaveBeenCalledWith(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      expect.objectContaining({ attribution: copy.attribution, maxZoom: 19 }),
    );
  });

  it("fits the initial view to the pins and the position", () => {
    const fitBounds = vi.spyOn(L.Map.prototype, "fitBounds");
    const pins = [pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })];

    render(
      <RoundMap
        pins={pins}
        path={[
          [1, 2],
          [3, 4],
        ]}
        position={{ lat: 5, lng: 6 }}
        recentre={() => {}}
      />,
    );

    expect(fitBounds).toHaveBeenCalledWith(
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      expect.objectContaining({ padding: [40, 40] }),
    );
  });

  it("centres on the one known point when there are no pins (matrix: Empty round)", () => {
    const setView = vi.spyOn(L.Map.prototype, "setView");

    render(<RoundMap pins={[]} path={[]} position={{ lat: 5, lng: 6 }} recentre={() => {}} />);

    expect(setView).toHaveBeenCalledWith([5, 6], 16);
  });

  it("falls back to the Brussels default with no pins and no position", () => {
    const setView = vi.spyOn(L.Map.prototype, "setView");

    render(<RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />);

    expect(setView).toHaveBeenCalledWith([50.8467, 4.3525], 14);
  });

  it("isolates its own stacking context so its panes cannot paint over sibling controls", () => {
    const { container } = render(
      <RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />,
    );

    const surface = container.querySelector('[role="application"]');
    expect(surface?.className).toContain("isolate");
  });
});

describe("RoundMap auto-fit", () => {
  it("keeps fitting a changing round until the agent moves the map by hand", () => {
    const setView = vi.spyOn(L.Map.prototype, "setView");
    const fitBounds = vi.spyOn(L.Map.prototype, "fitBounds");

    const { rerender } = render(
      <RoundMap pins={[]} path={[]} position={null} recentre={() => {}} />,
    );
    // Empty round, no position yet (a live query and a one-shot reading both
    // still settling on a real load): the Brussels default, not stuck there.
    expect(setView).toHaveBeenLastCalledWith([50.8467, 4.3525], 14);

    const pins = [pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })];
    rerender(<RoundMap pins={pins} path={[]} position={null} recentre={() => {}} />);
    expect(fitBounds).toHaveBeenLastCalledWith(
      [
        [1, 2],
        [3, 4],
      ],
      expect.objectContaining({ padding: [40, 40] }),
    );

    rerender(<RoundMap pins={pins} path={[]} position={{ lat: 5, lng: 6 }} recentre={() => {}} />);
    expect(fitBounds).toHaveBeenLastCalledWith(
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      expect.objectContaining({ padding: [40, 40] }),
    );
  });

  it("stops auto-fitting once a hand move fires, even when the pins then change", () => {
    const fitBounds = vi.spyOn(L.Map.prototype, "fitBounds");
    const realMap = L.map.bind(L);
    let instance: L.Map | undefined;
    vi.spyOn(L, "map").mockImplementation((el, options) => {
      instance = realMap(el, options);
      return instance;
    });

    const pins = [pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })];
    const { rerender } = render(
      <RoundMap pins={pins} path={[]} position={null} recentre={() => {}} />,
    );
    expect(fitBounds).toHaveBeenCalledTimes(1);

    // A real drag fires `movestart` with no `programmaticMove` flag around it
    // — this is that, without simulating actual pointer events.
    instance?.fire("movestart");

    const newPins = [pin({ lat: 9, lng: 9 }), pin({ lat: 10, lng: 10 })];
    rerender(<RoundMap pins={newPins} path={[]} position={null} recentre={() => {}} />);

    expect(fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe("RoundMap re-centre bookkeeping", () => {
  it("fits the pins and the known position after the fallback, and still pans a reading that lands late", () => {
    vi.useFakeTimers();
    try {
      const recentre = vi.fn();
      const fitBounds = vi.spyOn(L.Map.prototype, "fitBounds");
      const panTo = vi.spyOn(L.Map.prototype, "panTo");
      const pins = [pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })];
      const { rerender } = render(
        <RoundMap pins={pins} path={[]} position={{ lat: 5, lng: 6 }} recentre={recentre} />,
      );
      fitBounds.mockClear(); // drop the initial-view fit; only the tap matters here

      fireEvent.click(screen.getByRole("button", { name: copy.carte.recentre }));
      expect(panTo).not.toHaveBeenCalled(); // nothing landed yet

      vi.advanceTimersByTime(RECENTRE_TIMEOUT_MS);

      // The fallback fits pins *and* the position already known — never the
      // pins alone, which would drop a perfectly good position to Brussels.
      expect(fitBounds).toHaveBeenCalledWith(
        [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        expect.objectContaining({ padding: [40, 40] }),
      );

      // A reading that lands after the fallback already fired still pans:
      // `pendingRecentre` survives the fallback, it does not clear it.
      rerender(
        <RoundMap pins={pins} path={[]} position={{ lat: 9, lng: 10 }} recentre={recentre} />,
      );
      expect(panTo).toHaveBeenCalledWith([9, 10]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still pans a reading that lands after a no-position tap", () => {
    const recentre = vi.fn();
    const panTo = vi.spyOn(L.Map.prototype, "panTo");
    const { rerender } = render(
      <RoundMap pins={[]} path={[]} position={null} recentre={recentre} />,
    );

    fireEvent.click(screen.getByRole("button", { name: copy.carte.recentre }));

    rerender(<RoundMap pins={[]} path={[]} position={{ lat: 9, lng: 10 }} recentre={recentre} />);

    expect(panTo).toHaveBeenCalledWith([9, 10]);
  });
});

describe("RoundMap re-centre", () => {
  it("asks for a fresh reading, and pans once one arrives as a prop", async () => {
    const user = userEvent.setup();
    const recentre = vi.fn();
    const panTo = vi.spyOn(L.Map.prototype, "panTo");
    const { rerender } = render(
      <RoundMap pins={[]} path={[]} position={{ lat: 1, lng: 2 }} recentre={recentre} />,
    );

    await user.click(screen.getByRole("button", { name: copy.carte.recentre }));

    expect(recentre).toHaveBeenCalledTimes(1);
    // Nothing to pan to yet: the tap only asked, it did not already know where.
    expect(panTo).not.toHaveBeenCalled();

    rerender(<RoundMap pins={[]} path={[]} position={{ lat: 9, lng: 10 }} recentre={recentre} />);

    expect(panTo).toHaveBeenCalledWith([9, 10]);
  });

  it("fits the pins at once when there is no position to ask again from", async () => {
    const user = userEvent.setup();
    const recentre = vi.fn();
    const fitBounds = vi.spyOn(L.Map.prototype, "fitBounds");
    const pins = [pin({ lat: 1, lng: 2 }), pin({ lat: 3, lng: 4 })];
    render(<RoundMap pins={pins} path={[]} position={null} recentre={recentre} />);
    // Mount already fit once (the initial-view effect); only the tap's own
    // call matters here.
    fitBounds.mockClear();

    await user.click(screen.getByRole("button", { name: copy.carte.recentre }));

    expect(recentre).toHaveBeenCalledTimes(1);
    expect(fitBounds).toHaveBeenCalledWith(
      [
        [1, 2],
        [3, 4],
      ],
      expect.objectContaining({ padding: [40, 40] }),
    );
  });
});
