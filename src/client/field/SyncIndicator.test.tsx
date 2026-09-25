/**
 * Which live region a sync strip lands in (GH #83).
 *
 * `sync-view.test.ts` decides every state's tone, message and politeness, but
 * nothing checked that `SyncStrip` puts a strip in the region its `politeness`
 * names, or that the assertive region is the one carrying the button. Swapping
 * the two `StripRegion`s, or unmounting the quiet one, passed CI (GH #65
 * review deferral) — and "session just expired" is exactly the moment a screen
 * reader must announce.
 *
 * `useSyncState` is mocked rather than wrapped in a real `SyncProvider`: the
 * provider runs the sync engine on a timer, and these assertions are about the
 * wiring, not about the engine (already covered by `sync.test.ts`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { copy } from "../copy";
import type { PwaState } from "../pwa";
import { reconnectUrl } from "./reconnect-marker";
import { SyncStrip } from "./SyncIndicator";
import type { SyncState } from "./useSync";

const syncState = vi.hoisted(() => ({
  current: { status: "ok", running: false, pending: 0 } as Pick<
    SyncState,
    "status" | "running" | "pending"
  >,
}));

vi.mock("./useSync", () => ({
  useSyncState: () => syncState.current,
}));

const PWA: PwaState = {
  needRefresh: false,
  offlineReady: true,
  update: () => {},
  dismiss: () => {},
};

/** Captures where the button sends the browser instead of navigating away. */
const realLocation = Object.getOwnPropertyDescriptor(window, "location");

function stubLocation(href: string) {
  const location = { href, search: "" };
  Object.defineProperty(window, "location", { configurable: true, value: location });
  return location;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (realLocation) Object.defineProperty(window, "location", realLocation);
});

function renderStrip(state: typeof syncState.current, pwa: PwaState = PWA) {
  syncState.current = state;
  const { container } = render(<SyncStrip pwa={pwa} />);
  const region = (politeness: "polite" | "assertive") => {
    const node = container.querySelector(`[aria-live="${politeness}"]`);
    if (!node) throw new Error(`no ${politeness} region`);
    return node;
  };
  return { polite: region("polite"), assertive: region("assertive") };
}

describe("SyncStrip", () => {
  it("announces an expired session assertively, with the reconnect button", () => {
    const { polite, assertive } = renderStrip({ status: "auth", running: false, pending: 3 });

    expect(assertive.textContent).toContain(copy.sync.authExpired);
    expect(polite.textContent).toBe("");
    // Only "Se reconnecter" and "Mettre à jour" carry a button (epic context).
    expect(screen.getByRole("button", { name: copy.sync.reconnect })).toBeTruthy();
    expect(assertive.contains(screen.getByRole("button", { name: copy.sync.reconnect }))).toBe(
      true,
    );
  });

  it("sends the reconnect button through Access, marker and all", async () => {
    const user = userEvent.setup();
    const location = stubLocation("https://app.example/tournee");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderStrip({ status: "auth", running: false, pending: 3 });

    await user.click(screen.getByRole("button", { name: copy.sync.reconnect }));

    // The marker is what keeps the service worker's navigateFallback out of
    // the way, so the request actually reaches Access (reconnect-marker.ts).
    expect(location.href).toBe(reconnectUrl("https://app.example/tournee"));
  });

  it("takes the waiting build when the update button is tapped", async () => {
    const user = userEvent.setup();
    const update = vi.fn();
    renderStrip(
      { status: "upgrade", running: false, pending: 1 },
      { ...PWA, needRefresh: true, update },
    );

    await user.click(screen.getByRole("button", { name: copy.update.apply }));

    expect(update).toHaveBeenCalledOnce();
  });

  it("keeps waiting writes in the polite region, with no button", () => {
    const { polite, assertive } = renderStrip({ status: "ok", running: false, pending: 2 });

    expect(polite.textContent).toContain(copy.sync.pending(2));
    expect(assertive.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps both regions mounted and empty when everything is synced", () => {
    const { polite, assertive } = renderStrip({ status: "ok", running: false, pending: 0 });

    // Always mounted: a region a screen reader has never seen does not
    // announce when it appears (SyncIndicator.tsx).
    expect(polite.textContent).toBe("");
    expect(assertive.textContent).toBe("");
  });
});
