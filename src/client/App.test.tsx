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
  /** True while `/api/me` should fail unreachably, for the error-state case. */
  identityUnreachable: false,
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiFetch: () => {
    if (stub.identityPending) return new Promise(() => {});
    // Not an ApiError: a bare failure is "unreachable", which with no cached
    // identity is resolveIdentity's offline-first-run error (identity.ts).
    if (stub.identityUnreachable) return Promise.reject(new Error("unreachable"));
    return Promise.resolve(stub.me);
  },
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

/**
 * The band header `Band` draws, by the two classes that are its whole job:
 * `.safe-top` on the header for the notch inset, `h-band-height` on the row
 * inside it for the 56px (GH #59 retro, F1). Class-based because the band is
 * a plain `<header>` with no accessible name of its own — the brand text and
 * the tab nav inside it are asserted separately above.
 */
function bandHeader(container: HTMLElement) {
  return container.querySelector("header.safe-top.bg-band > .h-band-height");
}

// `stub` is module scope and every case writes to it, so without this the
// suite would only pass in the order it happens to be written in. The Dexie
// row goes too: `App`'s identity effect writes `meta.identity` without
// awaiting it, so a case's write can land during the next one and make it
// look like a different agent just signed in.
beforeEach(async () => {
  // Cleared here as well as in `afterEach`: the write above is not awaited,
  // so it can land *after* the clear that was meant to catch it. The
  // identity-error case below reads `offlineFirstRun` only with nothing
  // cached (identity.ts), so for that one the row decides the outcome.
  await fieldDb.meta.clear();
  stub.me = AGENT;
  stub.sync = QUIET;
  stub.needRefresh = false;
  stub.identityPending = false;
  stub.identityUnreachable = false;
});

afterEach(async () => {
  await fieldDb.meta.clear();
});

describe("App routing", () => {
  it("marks main busy while /api/me is still in flight", () => {
    stub.identityPending = true;
    const { container } = renderApp("/");

    // Not the field band's nav: FieldTabs needs `me` to decide isAdmin, so it
    // cannot render yet. That the band itself is there — GH #67 review: a
    // bandless loading frame flashed blank before every field session until
    // it was added — is asserted in "App band header" below.
    expect(fieldBand()).toBeNull();
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

describe("App band header", () => {
  // One component, four call sites (GH #59 retro, F1 — it had been written out
  // verbatim at each of them, and the sweep that was closing the epic's gaps
  // added the fourth). These pin the three frames a test can reach; the
  // fourth, `AdminFrameFallback`, needs a real lazy admin chunk and this suite
  // mocks it away.
  it("draws the band in the loading frame, while /api/me is still in flight", () => {
    stub.identityPending = true;
    const { container } = renderApp("/");

    expect(bandHeader(container)?.textContent).toContain(copy.appName);
  });

  it("draws the band in the identity-error frame", async () => {
    stub.identityUnreachable = true;
    const { container } = renderApp("/");

    expect(await screen.findByText(copy.errors.offlineFirstRun)).toBeTruthy();
    expect(bandHeader(container)?.textContent).toContain(copy.appName);
  });

  it("draws the band in the field frame", async () => {
    const { container } = renderApp("/tournee");

    expect(await screen.findByRole("navigation", { name: copy.nav.tabsLabel })).toBeTruthy();
    // The field band's row carries the tabs, the sync dot and the avatar too,
    // so this also pins that they are inside the band and not beside it.
    const band = bandHeader(container);
    expect(band?.textContent).toContain(copy.appName);
    expect(band?.querySelector("nav")).toBeTruthy();
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
