/**
 * The round screen (spec-gh-118): single-open rows, the outbox badge seeded
 * from a real `outboxVisits` row, Plus tard rows that carry no link, and the
 * empty state — all offline, against the real Dexie table `today.ts` reads.
 *
 * `useSyncState` is mocked (as `SyncIndicator.test.tsx` does) so nothing here
 * depends on the sync engine's timers; `useAgentPosition` runs for real and
 * reports "denied" under happy-dom (`test/setup-dom.ts`), which is the
 * position-denied state the matrix also covers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { copy } from "../copy";
import { formatDate } from "../format";
import type { FieldProspect, Prospect, Visit } from "../../shared/schemas";
import { fieldDb } from "./db";
import { TodayScreen } from "./TodayScreen";
import type { SyncState } from "./useSync";

const syncState = vi.hoisted(() => ({
  current: { lastSyncAt: 1_700_000_000_000, identity: "agent@example.com" } as Pick<
    SyncState,
    "lastSyncAt" | "identity"
  >,
}));

vi.mock("./useSync", () => ({
  useSyncState: () => syncState.current,
}));

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

const fieldProspect = (over: Partial<FieldProspect> = {}): FieldProspect => ({
  id: crypto.randomUUID(),
  name: "Food truck du pont",
  type: "food_truck",
  lat: null,
  lng: null,
  address: null,
  phone: null,
  createdAt: Date.now(),
  ...over,
});

const visit = (over: Partial<Visit> = {}): Visit => ({
  id: crypto.randomUUID(),
  prospectId: crypto.randomUUID(),
  visitedAt: Date.now(),
  lat: null,
  lng: null,
  flyerGiven: false,
  outcome: "interested",
  followUpAt: null,
  notes: null,
  scriptId: null,
  answers: {},
  ...over,
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/tournee"]}>
      <TodayScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  syncState.current = { lastSyncAt: 1_700_000_000_000, identity: "agent@example.com" };
});

afterEach(async () => {
  await Promise.all([
    fieldDb.prospects.clear(),
    fieldDb.outboxProspects.clear(),
    fieldDb.outboxVisits.clear(),
    fieldDb.sentVisits.clear(),
  ]);
});

describe("TodayScreen", () => {
  it("invites the agent to sync when the round is empty", async () => {
    renderScreen();

    expect(await screen.findByText(copy.today.empty)).toBeTruthy();
  });

  it("shows the next stop as a card and the rest as rows, only one row open at a time", async () => {
    await fieldDb.prospects.bulkAdd([
      prospect({ name: "Curry House" }),
      prospect({ name: "Bar des Marolles" }),
      prospect({ name: "Chez Léa" }),
    ]);

    const user = userEvent.setup();
    renderScreen();

    // The next stop's actions are already on screen, card-style, with no tap.
    const card = (await screen.findByText(copy.today.nextStop)).closest("article");
    expect(card).not.toBeNull();
    // The card is stop 1 in the walking order, with both actions and no tap.
    // `as HTMLElement`: asserted non-null on the line above.
    expect(within(card as HTMLElement).getByText("1")).toBeTruthy();
    expect(within(card as HTMLElement).getByRole("link", { name: copy.today.visit })).toBeTruthy();

    // The rows are whichever two stops are not the card (with no position,
    // `fieldDb.prospects.toArray()` orders by id, not insertion — so the
    // pairing of name to row is not asserted here, only the row behaviour).
    const rows = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-controls"));
    expect(rows).toHaveLength(2);
    const [rowTwo, rowThree] = rows as [HTMLElement, HTMLElement];
    expect(rowTwo.getAttribute("aria-expanded")).toBe("false");

    await user.click(rowTwo);
    expect(rowTwo.getAttribute("aria-expanded")).toBe("true");

    // Opening the third row closes the second (CAP-6: one row at a time).
    await user.click(rowThree);
    expect(rowThree.getAttribute("aria-expanded")).toBe("true");
    expect(rowTwo.getAttribute("aria-expanded")).toBe("false");

    // Expanding is display only: no outbox row, no prospect touched (invariant 2).
    expect(await fieldDb.outboxVisits.count()).toBe(0);
    expect(await fieldDb.outboxProspects.count()).toBe(0);
    expect((await fieldDb.prospects.toArray()).every((p) => p.status === "assigned")).toBe(true);
  });

  it("marks the next stop's card « Pas encore envoyé » from a seeded outboxVisits row", async () => {
    const solo = prospect({ name: "Curry House" });
    await fieldDb.prospects.add(solo);
    await fieldDb.outboxVisits.add(visit({ prospectId: solo.id }));

    renderScreen();

    const card = (await screen.findByText(copy.today.nextStop)).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText(copy.today.notSynced)).toBeTruthy();
  });

  it("marks a stop « Pas encore envoyé » from a seeded outboxVisits row, without touching order", async () => {
    // Fixed ids, not random: with no position the round falls back to
    // `fieldDb.prospects.toArray()`'s own order, which is primary-key (id)
    // order — so a known id ordering pins which stop is the card and which
    // is the row, and lets the test assert both.
    const first = prospect({ id: "00000000-0000-4000-8000-000000000001", name: "Curry House" });
    const second = prospect({
      id: "00000000-0000-4000-8000-000000000002",
      name: "Bar des Marolles",
    });
    await fieldDb.prospects.bulkAdd([first, second]);
    await fieldDb.outboxVisits.add(visit({ prospectId: second.id }));

    renderScreen();

    const card = (await screen.findByText(copy.today.nextStop)).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Curry House")).toBeTruthy();
    expect(within(card as HTMLElement).queryByText(copy.today.notSynced)).toBeNull();

    const row = screen.getByRole("button", { name: /Bar des Marolles/ });
    expect(within(row).getByText(copy.today.notSynced)).toBeTruthy();
    // Still on the list, in the same position — the outbox never hides or
    // reorders a stop (invariants 2, 3).
    expect(screen.getByText(copy.today.remaining(2))).toBeTruthy();
  });

  it("marks a field prospect not yet accepted the same way", async () => {
    await fieldDb.outboxProspects.add(fieldProspect({ name: "Camion à tacos" }));

    renderScreen();

    expect(await screen.findByText(copy.today.nextStop)).toBeTruthy();
    expect(screen.getByText(copy.today.notSynced)).toBeTruthy();
  });

  it("lists a future follow-up under Plus tard with no link or button", async () => {
    const now = syncState.current.lastSyncAt ?? Date.now();
    const dueLater = prospect({
      name: "Sushi Sablon",
      status: "follow_up",
      nextVisitAt: now + 7 * 86_400_000,
    });
    await fieldDb.prospects.add(dueLater);

    renderScreen();

    expect(await screen.findByText(copy.today.later)).toBeTruthy();
    const name = screen.getByText("Sushi Sablon");
    expect(name.closest("a")).toBeNull();
    expect(name.closest("button")).toBeNull();
    expect(screen.getByText(copy.today.dueOn(formatDate(dueLater.nextVisitAt ?? 0)))).toBeTruthy();
  });

  it("shows the next-stop card and Plus tard together when both apply", async () => {
    const now = syncState.current.lastSyncAt ?? Date.now();
    const dueToday = prospect({ name: "Curry House" });
    const dueLater = prospect({
      name: "Sushi Sablon",
      status: "follow_up",
      nextVisitAt: now + 7 * 86_400_000,
    });
    await fieldDb.prospects.bulkAdd([dueToday, dueLater]);

    renderScreen();

    const card = (await screen.findByText(copy.today.nextStop)).closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Curry House")).toBeTruthy();
    expect(await screen.findByText(copy.today.later)).toBeTruthy();
    expect(screen.getByText("Sushi Sablon")).toBeTruthy();
  });

  it("expands a row from the keyboard, with either Enter or Space", async () => {
    // Fixed ids so the round's fallback (primary-key) order is deterministic:
    // "Curry House" is the card, "Bar des Marolles" the one row.
    await fieldDb.prospects.bulkAdd([
      prospect({ id: "00000000-0000-4000-8000-000000000001", name: "Curry House" }),
      prospect({ id: "00000000-0000-4000-8000-000000000002", name: "Bar des Marolles" }),
    ]);

    const user = userEvent.setup();
    renderScreen();

    await screen.findByText(copy.today.nextStop);
    const row = screen.getByRole("button", { name: /Bar des Marolles/ });

    row.focus();
    expect(document.activeElement).toBe(row);
    await user.keyboard("{Enter}");
    expect(row.getAttribute("aria-expanded")).toBe("true");

    await user.keyboard(" ");
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });

  it("tells the agent their position was refused and offers to retry", async () => {
    await fieldDb.prospects.add(prospect());

    renderScreen();

    expect(await screen.findByText(copy.today.positionDenied)).toBeTruthy();
    expect(screen.getByRole("button", { name: copy.today.retryPosition })).toBeTruthy();
    // With no position, the card's distance says so instead of a number.
    expect(await screen.findByText(copy.today.distanceUnknown)).toBeTruthy();
  });

  it("reads n visites sur total, denominator held to the round's own size, across a real re-render", async () => {
    const stops = Array.from({ length: 5 }, (_, i) =>
      prospect({ id: `00000000-0000-4000-8000-00000000000${i}`, name: `Stop ${i}` }),
    );
    const [first, second, third] = stops as [Prospect, Prospect, Prospect, Prospect, Prospect];
    await fieldDb.prospects.bulkAdd(stops);
    await fieldDb.sentVisits.bulkAdd([
      {
        id: crypto.randomUUID(),
        prospectId: first.id,
        sentAt: Date.now(),
        writtenBy: "agent@example.com",
      },
      {
        id: crypto.randomUUID(),
        prospectId: second.id,
        sentAt: Date.now(),
        writtenBy: "agent@example.com",
      },
    ]);

    renderScreen();

    expect(await screen.findByText(copy.today.progress(2, 5))).toBeTruthy();

    // A visit queued for a third stop, absent from the log — the outbox side
    // of the union still counts it, so n rises to 3 with the denominator
    // unmoved.
    const thirdVisit = visit({ prospectId: third.id });
    await fieldDb.outboxVisits.add(thirdVisit);
    expect(await screen.findByText(copy.today.progress(3, 5))).toBeTruthy();

    // The sync accepted it and its outbox row is gone: the line must fall
    // back to n = 2, a real re-render rather than the DOM the line above
    // already satisfies (both "2 visites sur 5" and "3 visites sur 5" are
    // distinct strings, so this assertion can only pass if the count moved).
    await fieldDb.outboxVisits.delete(thirdVisit.id);
    expect(await screen.findByText(copy.today.progress(2, 5))).toBeTruthy();
  });

  it("singularises the day's first visit", async () => {
    const [first, secondStop] = [prospect({ name: "Curry House" }), prospect({ name: "Chez Léa" })];
    await fieldDb.prospects.bulkAdd([first, secondStop]);
    await fieldDb.sentVisits.add({
      id: crypto.randomUUID(),
      prospectId: first.id,
      sentAt: Date.now(),
      writtenBy: "agent@example.com",
    });

    renderScreen();

    expect(await screen.findByText(copy.today.progress(1, 2))).toBeTruthy();
  });

  it("shows no progress line on an empty round", async () => {
    renderScreen();

    await screen.findByText(copy.today.empty);
    expect(screen.queryByLabelText(copy.today.progressLabel)).toBeNull();
  });

  it("reads n visites sur n on a finished round", async () => {
    const stops = [prospect({ name: "Curry House" }), prospect({ name: "Chez Léa" })];
    await fieldDb.prospects.bulkAdd(stops);
    await fieldDb.sentVisits.bulkAdd(
      stops.map((s) => ({
        id: crypto.randomUUID(),
        prospectId: s.id,
        sentAt: Date.now(),
        writtenBy: "agent@example.com",
      })),
    );

    renderScreen();

    expect(await screen.findByText(copy.today.progress(2, 2))).toBeTruthy();
  });
});
