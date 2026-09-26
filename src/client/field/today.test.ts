import { describe, expect, it } from "vitest";
import type { FieldProspect, Prospect } from "../../shared/schemas";
import { buildTodayList, navigationUrl } from "./today";

/** The Grand-Place, which is where the local seed puts the round. */
const GRAND_PLACE = { lat: 50.8467, lng: 4.3525 };
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const prospect = (over: Partial<Prospect> = {}): Prospect => ({
  id: crypto.randomUUID(),
  name: "Le Bouchon",
  type: "restaurant",
  lat: null,
  lng: null,
  address: null,
  phone: null,
  website: null,
  cuisine: null,
  source: "csv",
  status: "assigned",
  assignedTo: "agent@example.com",
  lastVisitAt: null,
  nextVisitAt: null,
  ...over,
});

const field = (over: Partial<FieldProspect> = {}): FieldProspect => ({
  id: crypto.randomUUID(),
  name: "Food truck du pont",
  type: "food_truck",
  lat: null,
  lng: null,
  address: null,
  phone: null,
  createdAt: NOW,
  ...over,
});

/** Roughly 100 m, 400 m and 800 m north of the Grand-Place. */
const near = (metresNorth: number) => ({
  lat: GRAND_PLACE.lat + metresNorth / 111_320,
  lng: GRAND_PLACE.lng,
});

describe("buildTodayList", () => {
  it("orders the round nearest-next from the agent", () => {
    const list = buildTodayList(
      [
        prospect({ name: "loin", ...near(800) }),
        prospect({ name: "près", ...near(100) }),
        prospect({ name: "milieu", ...near(400) }),
      ],
      [],
      GRAND_PLACE,
      NOW,
    );

    expect(list.now.map((i) => i.name)).toEqual(["près", "milieu", "loin"]);
  });

  it("puts prospects with no coordinates last, keeping their order", () => {
    const list = buildTodayList(
      [
        prospect({ name: "sans position" }),
        prospect({ name: "avec position", ...near(500) }),
        prospect({ name: "sans position aussi" }),
      ],
      [],
      GRAND_PLACE,
      NOW,
    );

    expect(list.now.map((i) => i.name)).toEqual([
      "avec position",
      "sans position",
      "sans position aussi",
    ]);
  });

  it("leaves the order alone when there is no position to measure from", () => {
    // A denied permission must not reorder or hide anything.
    const list = buildTodayList(
      [prospect({ name: "a", ...near(900) }), prospect({ name: "b", ...near(50) })],
      [],
      null,
      NOW,
    );

    expect(list.now.map((i) => i.name)).toEqual(["a", "b"]);
    expect(list.now.every((i) => i.distanceM === null)).toBe(true);
  });

  it("measures the distance to each located prospect", () => {
    const [item] = buildTodayList([prospect(near(1000))], [], GRAND_PLACE, NOW).now;

    expect(item?.distanceM).toBeGreaterThan(950);
    expect(item?.distanceM).toBeLessThan(1050);
  });

  describe("the later group", () => {
    it("holds back a follow-up that is not due yet", () => {
      const list = buildTodayList(
        [
          prospect({ name: "à faire", status: "assigned" }),
          prospect({
            name: "la semaine prochaine",
            status: "follow_up",
            nextVisitAt: NOW + 7 * DAY,
          }),
        ],
        [],
        GRAND_PLACE,
        NOW,
      );

      expect(list.now.map((i) => i.name)).toEqual(["à faire"]);
      expect(list.later.map((i) => i.name)).toEqual(["la semaine prochaine"]);
    });

    it("keeps an overdue follow-up in the round", () => {
      const list = buildTodayList(
        [prospect({ name: "en retard", status: "follow_up", nextVisitAt: NOW - DAY })],
        [],
        GRAND_PLACE,
        NOW,
      );

      expect(list.now.map((i) => i.name)).toEqual(["en retard"]);
      expect(list.later).toEqual([]);
    });

    it("keeps a follow-up with no date in the round", () => {
      const list = buildTodayList(
        [prospect({ name: "sans date", status: "follow_up", nextVisitAt: null })],
        [],
        GRAND_PLACE,
        NOW,
      );

      expect(list.now.map((i) => i.name)).toEqual(["sans date"]);
    });

    it("sorts the later group by when it comes due, not by distance", () => {
      const list = buildTodayList(
        [
          prospect({
            name: "dans 7 j",
            status: "follow_up",
            nextVisitAt: NOW + 7 * DAY,
            ...near(10),
          }),
          prospect({
            name: "dans 2 j",
            status: "follow_up",
            nextVisitAt: NOW + 2 * DAY,
            ...near(900),
          }),
        ],
        [],
        GRAND_PLACE,
        NOW,
      );

      expect(list.later.map((i) => i.name)).toEqual(["dans 2 j", "dans 7 j"]);
    });
  });

  describe("unsynced field prospects", () => {
    it("shows one the server has not accepted yet, so it can be visited offline", () => {
      const list = buildTodayList([], [field({ name: "Food truck du pont" })], GRAND_PLACE, NOW);

      expect(list.now.map((i) => i.name)).toEqual(["Food truck du pont"]);
      expect(list.now[0]?.pending).toBe(true);
    });

    it("invents no status for a prospect the server has never seen", () => {
      // INVARIANT 3: status is the server's to derive.
      const list = buildTodayList([], [field()], GRAND_PLACE, NOW);

      expect(list.now[0]?.status).toBeNull();
    });

    it("orders it among the rest by distance like anything else", () => {
      const list = buildTodayList(
        [prospect({ name: "loin", ...near(800) }), prospect({ name: "près", ...near(100) })],
        [field({ name: "camion", ...near(400) })],
        GRAND_PLACE,
        NOW,
      );

      expect(list.now.map((i) => i.name)).toEqual(["près", "camion", "loin"]);
    });

    it("does not show it twice in the window between accept and outbox delete", () => {
      const id = crypto.randomUUID();
      const list = buildTodayList(
        [prospect({ id, name: "Food truck du pont", source: "field" })],
        [field({ id, name: "Food truck du pont" })],
        GRAND_PLACE,
        NOW,
      );

      expect(list.now).toHaveLength(1);
      // The server's copy wins: it is the one with a real status.
      expect(list.now[0]?.pending).toBe(false);
    });
  });
});

describe("visitQueued", () => {
  it("defaults to false, so calls that predate the parameter keep working", () => {
    const list = buildTodayList([prospect({ name: "a" })], [], GRAND_PLACE, NOW);

    expect(list.now[0]?.visitQueued).toBe(false);
  });

  it("flags only the stop whose visit is queued, leaving order and later unchanged", () => {
    const queued = prospect({ name: "en attente", ...near(400) });
    const list = buildTodayList(
      [
        prospect({ name: "loin", ...near(800) }),
        prospect({ name: "près", ...near(100) }),
        queued,
        prospect({
          name: "plus tard",
          status: "follow_up",
          nextVisitAt: NOW + DAY,
        }),
      ],
      [],
      GRAND_PLACE,
      NOW,
      new Set([queued.id]),
    );

    // Walking order is untouched by the flag.
    expect(list.now.map((i) => i.name)).toEqual(["près", "en attente", "loin"]);
    expect(list.now.find((i) => i.id === queued.id)?.visitQueued).toBe(true);
    expect(list.now.filter((i) => i.visitQueued)).toHaveLength(1);
    expect(list.later.every((i) => !i.visitQueued)).toBe(true);
  });

  it("flags a field prospect not yet accepted, on top of its own pending flag", () => {
    const outboxRow = field({ name: "camion" });
    const list = buildTodayList([], [outboxRow], GRAND_PLACE, NOW, new Set([outboxRow.id]));

    expect(list.now[0]?.pending).toBe(true);
    expect(list.now[0]?.visitQueued).toBe(true);
  });
});

describe("navigationUrl", () => {
  it("points at the coordinates on OpenStreetMap", () => {
    const url = navigationUrl({ lat: 45.7578, lng: 4.832, name: "Le Bouchon" });

    expect(url).toContain("openstreetmap.org");
    expect(url).toContain("mlat=45.757800");
    expect(url).toContain("mlon=4.832000");
  });

  it("has nowhere to send an agent without coordinates", () => {
    expect(navigationUrl({ lat: null, lng: null, name: "Inconnu" })).toBeNull();
  });
});
