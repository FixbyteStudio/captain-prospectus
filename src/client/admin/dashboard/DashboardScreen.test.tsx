/**
 * Tableau de bord's states — GH #107: skeletons, the two cards, the period
 * selector and the load-failed alert. Rendered on its own with a fresh
 * client per test, so no answer leaks between them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { copy } from "../../copy";
import type { DashboardResponse } from "../../../shared/schemas";
import { createAdminQueryClient } from "../query-client";
import { DashboardScreen } from "./DashboardScreen";

function answer(
  period: number,
  over: Partial<DashboardResponse["visits"]> = {},
): DashboardResponse {
  const visits = { value: period * 10, previous: period * 8, delta: 0.25, ...over };
  return {
    period: period as DashboardResponse["period"],
    from: 0,
    to: 1,
    visits,
    openProspects: 278,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Answers each period with `respond`, and records what was asked. */
function stubFetch(respond: (period: number) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const period = Number(new URL(String(input), "http://localhost").searchParams.get("period"));
    return respond(period);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderScreen() {
  const client = createAdminQueryClient();
  // The factory's one retry waits a second; these tests do not need it.
  client.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false } });
  render(
    <QueryClientProvider client={client}>
      <DashboardScreen />
    </QueryClientProvider>,
  );
  return client;
}

/** The delta chip inside the Visites card. */
function chip(): HTMLElement {
  const element = card(copy.dashboard.visits).querySelector<HTMLElement>("[data-slot=badge]");
  if (!element) throw new Error("no delta chip");
  return element;
}

/** The card whose overline label is `label`. */
function card(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name: label });
  const element = heading.closest<HTMLElement>("[data-slot=card]");
  if (!element) throw new Error(`no card around ${label}`);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardScreen", () => {
  it("shows skeletons, then both cards for 30 jours by default", async () => {
    const fetchMock = stubFetch((period) => json(answer(period)));
    renderScreen();

    expect(screen.getByText(copy.dashboard.loading)).toBeTruthy();
    expect(await screen.findByText("300")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/dashboard?period=30", expect.anything());

    expect(within(card(copy.dashboard.openProspects)).getByText("278")).toBeTruthy();
    const visits = within(card(copy.dashboard.visits));
    // The default normalizer folds formatDelta's no-break space to a space.
    expect(visits.getByText("+25,0 %")).toBeTruthy();
    expect(visits.getByText(copy.dashboard.vsPrevious)).toBeTruthy();
    // A snapshot has no delta row.
    expect(
      within(card(copy.dashboard.openProspects)).queryByText(copy.dashboard.vsPrevious),
    ).toBeNull();
    expect(
      screen.getByRole("radio", { name: copy.dashboard.periods[30] }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("changes Visites with the period while Prospects ouverts stays put", async () => {
    const user = userEvent.setup();
    stubFetch((period) => json(answer(period)));
    renderScreen();
    await screen.findByText("300");

    await user.click(screen.getByRole("radio", { name: copy.dashboard.periods[7] }));

    expect(await within(card(copy.dashboard.visits)).findByText("70")).toBeTruthy();
    expect(within(card(copy.dashboard.openProspects)).getByText("278")).toBeTruthy();
  });

  it("keeps the period when the chosen one is pressed again", async () => {
    const user = userEvent.setup();
    stubFetch((period) => json(answer(period)));
    renderScreen();
    await screen.findByText("300");

    const thirty = screen.getByRole("radio", { name: copy.dashboard.periods[30] });
    await user.click(thirty);

    expect(thirty.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("300")).toBeTruthy();
  });

  it("shows a neutral « — » when there is no previous period (I/O matrix, previous empty)", async () => {
    stubFetch((period) => json(answer(period, { previous: 0, delta: null })));
    renderScreen();

    expect(await within(await findCard(copy.dashboard.visits)).findByText("—")).toBeTruthy();
  });

  it.each([
    [0.25, "tint-success", "lucide-arrow-up"],
    [-0.03, "tint-destructive", "lucide-arrow-down"],
    [null, "secondary", null],
  ] as const)("colours a delta of %s as %s", async (delta, variant, arrow) => {
    stubFetch((period) => json(answer(period, { delta })));
    renderScreen();
    await findCard(copy.dashboard.visits);

    await waitFor(() => expect(chip().dataset.variant).toBe(variant));
    const svg = chip().querySelector("svg");
    if (arrow === null) expect(svg).toBeNull();
    else expect(svg?.classList.contains(arrow)).toBe(true);
  });

  it("keeps the last period's figures while the next one loads", async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    stubFetch((period) => (period === 7 ? held : json(answer(period))));
    renderScreen();
    await screen.findByText("300");

    await user.click(screen.getByRole("radio", { name: copy.dashboard.periods[7] }));

    expect(screen.getByText("300")).toBeTruthy();
    const grid = card(copy.dashboard.visits).parentElement;
    expect(grid?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.querySelector("[data-slot=skeleton]")).toBeNull();

    release(json(answer(7)));
    expect(await within(card(copy.dashboard.visits)).findByText("70")).toBeTruthy();
  });

  it("keeps the figures under the Alert when a refetch fails", async () => {
    let fail = false;
    stubFetch((period) => (fail ? json({ error: "error" }, 500) : json(answer(period))));
    const client = renderScreen();
    await screen.findByText("300");

    fail = true;
    await client.refetchQueries();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(copy.dashboard.loadFailed);
    expect(screen.getByText("300")).toBeTruthy();
    expect(within(card(copy.dashboard.openProspects)).getByText("278")).toBeTruthy();
  });

  it("offers « Réessayer » when loading fails, and it refetches (I/O matrix, load fails)", async () => {
    const user = userEvent.setup();
    let fail = true;
    const fetchMock = stubFetch((period) =>
      fail ? json({ error: "error" }, 500) : json(answer(period)),
    );
    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(copy.dashboard.loadFailed);

    fail = false;
    await user.click(within(alert).getByRole("button", { name: copy.dashboard.retry }));

    expect(await screen.findByText("300")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

async function findCard(label: string): Promise<HTMLElement> {
  await screen.findByRole("heading", { level: 3, name: label });
  return card(label);
}
