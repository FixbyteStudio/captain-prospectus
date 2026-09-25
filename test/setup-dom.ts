// Dexie needs an IndexedDB implementation outside the browser (setup-unit.ts).
import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * happy-dom declares `navigator.geolocation` but leaves it `null`, so
 * `useAgentPosition`'s `"geolocation" in navigator` guard passes and the call
 * that follows throws — in a real browser the property is either absent or a
 * working object. This gives it the "permission refused" shape, which the
 * round already handles (« Position inconnue »), rather than a crash.
 */
if (!navigator.geolocation) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) =>
        fail?.({ code: 1, message: "denied" } as GeolocationPositionError),
      watchPosition: () => 0,
      clearWatch: () => {},
    },
  });
}

// Vitest's `globals` are off, so Testing Library's auto-cleanup never registers
// itself. Without this a mounted tree survives into the next test and
// `getByRole` finds two of everything.
afterEach(cleanup);
