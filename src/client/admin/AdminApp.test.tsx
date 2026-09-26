/**
 * The admin routes' two ends — GH #107, #90.
 *
 * `/admin` used to render an empty frame, and so did any path no route
 * matched. `fetch` is stubbed per URL: the sidebar asks for its two queue
 * counts on every admin path, and the dashboard for its figures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { copy } from "../copy";
import type { DashboardResponse } from "../../shared/schemas";
import { AdminApp } from "./AdminApp";

const DASHBOARD: DashboardResponse = {
  period: 30,
  from: 0,
  to: 1,
  visits: { value: 386, previous: 343, delta: 0.1254 },
  openProspects: 278,
  converted: { value: 41, previous: 36, delta: 0.1389 },
  conversionRate: {
    value: 0.106,
    previous: 0.094,
    delta: 0.012,
    visitedProspects: { value: 386, previous: 383 },
  },
  visitsByDay: [],
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/admin/dashboard")) return json(DASHBOARD);
      if (url.startsWith("/api/admin/prospects/duplicates"))
        return json({ pairs: [], truncated: false });
      if (url.startsWith("/api/admin/visits/orphaned")) return json({ visits: [], remaining: 0 });
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAdmin(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="/admin/*"
          element={<AdminApp email="admin@example.com" updatePrompt={null} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** The sidebar's item, not the breadcrumb's page (also a "link") of the same name. */
function sidebarLink(name: string): HTMLElement {
  const item = screen
    .getAllByRole("link", { name })
    .find((link) => link.closest("[data-slot=sidebar-menu-button]"));
  if (!item) throw new Error(`no sidebar item named ${name}`);
  return item;
}

describe("AdminApp", () => {
  it("opens Tableau de bord on /admin, current in the sidebar", async () => {
    renderAdmin("/admin");

    expect(screen.getByRole("heading", { level: 2, name: copy.dashboard.title })).toBeTruthy();
    // The figures arrive from the stubbed endpoint.
    expect(await screen.findByText("278")).toBeTruthy();
    expect(sidebarLink(copy.nav.dashboard).getAttribute("aria-current")).toBe("page");
    expect(sidebarLink(copy.nav.prospects).getAttribute("aria-current")).toBeNull();
  });

  it("answers an unknown admin path with « Page introuvable. » inside the frame (#90)", () => {
    renderAdmin("/admin/inconnu");

    expect(screen.getByText(copy.errors.notFound)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: copy.dashboard.title })).toBeNull();
    // Still the admin frame: the sidebar is there, and nothing in it is current.
    expect(sidebarLink(copy.nav.dashboard).getAttribute("aria-current")).toBeNull();
  });
});
