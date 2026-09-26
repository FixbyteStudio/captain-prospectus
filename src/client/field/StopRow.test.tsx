/**
 * The shared stop row (spec-gh-118): tap toggles `aria-expanded`, expanding
 * reveals the same "Y aller"/"Visiter" pair the next-stop card carries, a
 * stop with no coordinates drops "Y aller", and the outbox badge is read-only
 * (invariants 2, 3 — never a reason to hide or reorder a stop).
 */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { copy } from "../copy";
import { STATUS_EDGE } from "../admin/status";
import { edgeFor, StopRow } from "./StopRow";
import type { TodayItem } from "./today";

const item = (over: Partial<TodayItem> = {}): TodayItem => ({
  id: "11111111-1111-1111-1111-111111111111",
  name: "Le Bouchon",
  type: "restaurant",
  lat: 50.8467,
  lng: 4.3525,
  address: "Rue du Midi 42",
  status: "assigned",
  nextVisitAt: null,
  pending: false,
  distanceM: 120,
  visitQueued: false,
  ...over,
});

/** A row owns no state of its own (shared with Carte and the admin view). */
function ControlledRow({ initial = false, item: theItem }: { initial?: boolean; item: TodayItem }) {
  const [expanded, setExpanded] = useState(initial);
  return (
    <StopRow item={theItem} index={2} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
  );
}

function renderRow(theItem: TodayItem, initial = false) {
  return render(
    <MemoryRouter>
      <ul>
        <ControlledRow initial={initial} item={theItem} />
      </ul>
    </MemoryRouter>,
  );
}

describe("StopRow", () => {
  it("starts collapsed with no actions on screen", () => {
    renderRow(item());

    const button = screen.getByRole("button", { name: /Le Bouchon/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: copy.today.visit })).toBeNull();
    // Collapsed, the row still carries its walking-order number and distance.
    expect(within(button).getByText("2")).toBeTruthy();
    expect(within(button).getByText("120 m")).toBeTruthy();
  });

  it("expands on tap to show Y aller and Visiter, with the right hrefs", async () => {
    const user = userEvent.setup();
    renderRow(item());

    await user.click(screen.getByRole("button", { name: /Le Bouchon/ }));

    const button = screen.getByRole("button", { name: /Le Bouchon/ });
    expect(button.getAttribute("aria-expanded")).toBe("true");

    const visit = screen.getByRole("link", { name: copy.today.visit });
    expect(visit.getAttribute("href")).toBe("/tournee/11111111-1111-1111-1111-111111111111");

    const navigate = screen.getByRole("link", { name: copy.today.navigate });
    expect(navigate.getAttribute("href")).toContain("openstreetmap.org");
  });

  it("collapses again on a second tap", async () => {
    const user = userEvent.setup();
    renderRow(item(), true);

    const button = screen.getByRole("button", { name: /Le Bouchon/ });
    expect(button.getAttribute("aria-expanded")).toBe("true");

    await user.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: copy.today.visit })).toBeNull();
  });

  it("drops Y aller and gives Visiter the full width when there are no coordinates", () => {
    renderRow(item({ lat: null, lng: null, distanceM: null }), true);

    expect(screen.getByText(copy.today.distanceUnknown)).toBeTruthy();

    expect(screen.queryByRole("link", { name: copy.today.navigate })).toBeNull();
    const visit = screen.getByRole("link", { name: copy.today.visit });
    // The wrapping grid drops to one column so Visiter takes the full width.
    expect(visit.parentElement?.className).toContain("grid-cols-1");
  });

  it("shows « Pas encore envoyé » for a stop with a queued visit", () => {
    renderRow(item({ visitQueued: true }));

    expect(screen.getByText(copy.today.notSynced)).toBeTruthy();
  });

  it("shows « Pas encore envoyé » for a field prospect not yet accepted", () => {
    renderRow(item({ pending: true, status: null }));

    expect(screen.getByText(copy.today.notSynced)).toBeTruthy();
  });

  it("gives a field prospect with no server status the `new` edge", () => {
    expect(edgeFor({ status: null })).toBe(STATUS_EDGE.new);
    expect(edgeFor({ status: "follow_up" })).toBe(STATUS_EDGE.follow_up);
  });

  it("says nothing about the outbox for a stop that is fully synced", () => {
    renderRow(item());

    expect(screen.queryByText(copy.today.notSynced)).toBeNull();
  });
});
