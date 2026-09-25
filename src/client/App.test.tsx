/**
 * Which frame each route and role gets (GH #83).
 *
 * `App.tsx`'s route table is reachable only through JSX, so nothing failed
 * when the `!isAdmin` forbidden route, the `*` not-found route or the
 * `updatePrompt` prop handed to `AdminApp` was deleted (GH #61/#64/#65 review
 * deferrals). The refactor sweep (#67) rewrites exactly this file.
 *
 * The three module boundaries below are mocked rather than run: `./api` for
 * the role (the network is not the subject), `./field/useSync` for sync state
 * (the engine has its own tests, and a real provider would put every
 * assertion behind its timers), `virtual:pwa-register/react` so `usePwa` — the
 * real one — reports a waiting build, and `./admin/AdminApp` so an admin route
 * does not drag TanStack Query, sonner and PapaParse into a shell test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import type * as ApiModule from "./api";
import type { MeResponse } from "../shared/schemas";
import { App } from "./App";
import { copy } from "./copy";
import { fieldDb } from "./field/db";
import type { SyncState } from "./field/useSync";

type SyncStub = Pick<SyncState, "status" | "running" | "pending">;

const AGENT: MeResponse = { email: "agent@example.com", role: "agent" };
const ADMIN: MeResponse = { email: "admin@example.com", role: "admin" };
const QUIET: SyncStub = { status: "ok", running: false, pending: 0 };

const stub = vi.hoisted(() => ({
  me: { email: "agent@example.com", role: "agent" } as MeResponse,
  sync: { status: "ok", running: false, pending: 0 } as Pick<
    SyncState,
    "status" | "running" | "pending"
  >,
  needRefresh: false,
  /** True while `/api/me` should never settle, for the loading-state case. */
  identityPending: false,
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch: () => (stub.identityPending ? new Promise(() => {}) : Promise.resolve(stub.me)),
}));

vi.mock("./field/useSync", () => ({
  SyncProvider: ({ children }: { children: React.ReactNode }) => children,
  useSyncState: () => ({ ...stub.sync, lastSyncAt: null, syncNow: async () => {} }),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [stub.needRefresh, () => {}],
    offlineReady: [true, () => {}],
    updateServiceWorker: async () => {},
  }),
}));

vi.mock("./admin/AdminApp", () => ({
  AdminApp: ({ updatePrompt }: { email: string; updatePrompt: React.ReactNode }) => (
    <div data-testid="admin-frame">{updatePrompt}</div>
  ),
}));

/** The router's own pathname, so a redirect is asserted, not inferred. */
function CurrentPath() {
  return <p data-testid="pathname">{useLocation().pathname}</p>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <CurrentPath />
    </MemoryRouter>,
  );
}

/** Present only inside `FieldFrame` (its `FieldTabs`), never in the admin frame. */
const fieldBand = () => screen.queryByRole("navigation", { name: copy.nav.tabsLabel });

// `stub` is module scope and every case writes to it, so without this the
// suite would only pass in the order it happens to be written in. The Dexie
// row goes too: `App`'s identity effect writes `meta.identity` without
// awaiting it, so a case's write can land during the next one and make it
// look like a different agent just signed in.
beforeEach(() => {
  stub.me = AGENT;
  stub.sync = QUIET;
  stub.needRefresh = false;
  stub.identityPending = false;
});

afterEach(async () => {
  await fieldDb.meta.clear();
});

describe("App routing", () => {
  it("shows the band over a busy main while /api/me is still in flight", () => {
    stub.identityPending = true;
    const { container } = renderApp("/");

    // The brand, not the field band's nav (FieldTabs needs `me` to decide
    // isAdmin, so it cannot render yet) — GH #67 review: a bandless loading
    // frame flashed blank before every field session until this was added.
    expect(screen.getByText(copy.appName)).toBeTruthy();
    const main = container.querySelector("main");
    expect(main?.getAttribute("aria-busy")).toBe("true");
  });

  it("sends an agent from / to the round, in the field frame", async () => {
    renderApp("/");

    // The band appears only once identity has settled and the redirect has run.
    expect(await screen.findByRole("navigation", { name: copy.nav.tabsLabel })).toBeTruthy();
    expect(screen.getByTestId("pathname").textContent).toBe("/tournee");
    expect(screen.queryByTestId("admin-frame")).toBeNull();
  });

  it("sends an online admin from / to the admin side, in the admin frame", async () => {
    stub.me = ADMIN;
    renderApp("/");

    expect(await screen.findByTestId("admin-frame")).toBeTruthy();
    expect(screen.getByTestId("pathname").textContent).toBe("/admin/prospects");
    expect(fieldBand()).toBeNull();
  });

  it("answers an agent on an admin route with the forbidden state, inside the field frame", async () => {
    renderApp("/admin/prospects");

    expect(await screen.findByText(copy.errors.forbidden)).toBeTruthy();
    // Not a redirect: the agent stays where they are, with a way back.
    expect(screen.getByTestId("pathname").textContent).toBe("/admin/prospects");
    expect(screen.getByRole("link", { name: copy.visit.back }).getAttribute("href")).toBe(
      "/tournee",
    );
    expect(fieldBand()).toBeTruthy();
    expect(screen.queryByTestId("admin-frame")).toBeNull();
  });

  it("answers an unknown path with the not-found state, inside the field frame", async () => {
    stub.me = ADMIN;
    renderApp("/nulle-part");

    expect(await screen.findByText(copy.errors.notFound)).toBeTruthy();
    expect(fieldBand()).toBeTruthy();
  });
});

describe("App update prompt", () => {
  it("shows the update banner once under the band while the strip is quiet", async () => {
    stub.needRefresh = true;
    renderApp("/tournee");

    // Once: `FieldFrame` renders it, and nothing else on the field side does.
    expect(await screen.findAllByText(copy.update.available)).toHaveLength(1);
  });

  it("hands the banner to the admin frame as its updatePrompt prop", async () => {
    // The admin side has no band to hang it under, so `App` passes the prompt
    // into `AdminApp` instead — the one place that prop is decided.
    stub.me = ADMIN;
    stub.needRefresh = true;
    renderApp("/admin/prospects");

    const frame = await screen.findByTestId("admin-frame");
    expect(frame.textContent).toContain(copy.update.available);
  });

  it("steps aside for the update-needed strip, which carries the button instead", async () => {
    stub.sync = { status: "upgrade", running: false, pending: 1 };
    stub.needRefresh = true;
    const { container } = renderApp("/tournee");

    expect(await screen.findByText(copy.sync.upgrade)).toBeTruthy();
    // hidesUpdateBanner: the strip already says a build is waiting.
    expect(screen.queryByText(copy.update.available)).toBeNull();
    const assertive = container.querySelector('[aria-live="assertive"]');
    expect(assertive?.textContent).toContain(copy.sync.upgrade);
    const button = screen.getByRole("button", { name: copy.update.apply });
    expect(assertive?.contains(button)).toBe(true);
  });
});
