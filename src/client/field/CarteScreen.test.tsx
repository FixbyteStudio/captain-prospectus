/**
 * Carte's own wiring (spec-gh-121): `RoundMap` is mocked, so this only checks
 * what `CarteScreen` feeds it and when it swaps it out for the offline notice
 * — never that Leaflet actually draws (that's `RoundMap.test.tsx`, against the
 * real thing).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { copy } from "../copy";
import type { TodayItem, TodayList } from "./today";
import type { RoundState } from "./useRound";

const round = vi.hoisted(() => ({
  current: {
    list: { now: [], later: [] } as TodayList,
    point: null,
    locating: false,
    denied: false,
    refresh: vi.fn(),
  } as RoundState,
}));
vi.mock("./useRound", () => ({ useRound: () => round.current }));

vi.mock("./RoundMap", () => ({
  RoundMap: vi.fn(() => <div data-testid="round-map" />),
}));

// Imported after the mock so this binding is the mocked one.
import { RoundMap } from "./RoundMap";
import { CarteScreen } from "./CarteScreen";

const item = (over: Partial<TodayItem> = {}): TodayItem => ({
  id: crypto.randomUUID(),
  name: "Le Bouchon",
  type: "restaurant",
  lat: 50.8467,
  lng: 4.3525,
  address: "12 rue Sainte-Catherine",
  status: "assigned",
  nextVisitAt: null,
  pending: false,
  distanceM: null,
  visitQueued: false,
  ...over,
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/tournee/carte"]}>
      <CarteScreen />
    </MemoryRouter>,
  );
}

/** The props of RoundMap's first render — asserted to exist rather than
 * indexed with `!`, since a missing call is exactly the failure this file
 * checks for elsewhere. */
function roundMapProps() {
  const [call] = vi.mocked(RoundMap).mock.calls;
  if (!call) throw new Error("RoundMap was never rendered");
  return call[0];
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  round.current = {
    list: { now: [], later: [] },
    point: null,
    locating: false,
    denied: false,
    refresh: vi.fn(),
  };
});

describe("CarteScreen", () => {
  it("shows the offline notice, links back to the list, and never mounts RoundMap", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    renderScreen();

    expect(screen.getByText(copy.carte.offline)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.carte.showList }).getAttribute("href")).toBe(
      "/tournee",
    );
    expect(screen.queryByTestId("round-map")).toBeNull();
    expect(RoundMap).not.toHaveBeenCalled();
  });

  it("feeds RoundMap the round's pins, its position and its own refresh as recentre, when online", () => {
    const stop = item();
    round.current = {
      ...round.current,
      list: { now: [stop], later: [] },
      point: { lat: 50.85, lng: 4.35 },
    };

    renderScreen();

    expect(screen.getByTestId("round-map")).toBeTruthy();
    const props = roundMapProps();
    expect(props.pins).toEqual([{ id: stop.id, index: 1, lat: 50.8467, lng: 4.3525, next: true }]);
    expect(props.path).toEqual([[50.8467, 4.3525]]);
    // Same position the round reads, not a second one of this screen's own —
    // one `useAgentPosition` reading, per `useRound`.
    expect(props.position).toBe(round.current.point);

    props.recentre();
    expect(round.current.refresh).toHaveBeenCalledTimes(1);
  });

  it("draws no pin for a Plus tard follow-up", () => {
    const stop = item();
    const later = item({ status: "follow_up", nextVisitAt: Date.now() + 86_400_000 });
    round.current = { ...round.current, list: { now: [stop], later: [later] } };

    renderScreen();

    expect(roundMapProps().pins.map((pin) => pin.id)).toEqual([stop.id]);
  });

  it("renders an empty map with no pins for an empty round", () => {
    renderScreen();

    expect(screen.getByTestId("round-map")).toBeTruthy();
    expect(roundMapProps().pins).toEqual([]);
  });

  it("shows the position-denied notice over the map, pins still shown, and Réessayer calls refresh", async () => {
    const user = userEvent.setup();
    round.current = { ...round.current, denied: true, list: { now: [item()], later: [] } };

    renderScreen();

    expect(screen.getByText(copy.today.positionDenied)).toBeTruthy();
    expect(screen.getByTestId("round-map")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: copy.today.retryPosition }));
    expect(round.current.refresh).toHaveBeenCalledTimes(1);
  });

  it("swaps the map for the offline notice the instant the network drops, and remounts it once back online", () => {
    renderScreen();
    expect(screen.getByTestId("round-map")).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText(copy.carte.offline)).toBeTruthy();
    expect(screen.queryByTestId("round-map")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.getByTestId("round-map")).toBeTruthy();
    expect(screen.queryByText(copy.carte.offline)).toBeNull();
  });
});
