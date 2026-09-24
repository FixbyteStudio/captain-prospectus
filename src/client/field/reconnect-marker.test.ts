import { describe, expect, it } from "vitest";
import {
  hasReconnectMarker,
  RECONNECT_MARKER_PATTERN,
  reconnectUrl,
  withoutReconnectMarker,
} from "./reconnect-marker";

/** Workbox matches the denylist against `pathname + search`, never the hash. */
function pathAndSearch(href: string): string {
  const url = new URL(href, "http://reconnect.invalid/");
  return `${url.pathname}${url.search}`;
}

describe("RECONNECT_MARKER_PATTERN", () => {
  it("matches the pathname + search of every reconnectUrl shape", () => {
    expect(RECONNECT_MARKER_PATTERN.test(pathAndSearch(reconnectUrl("/tournee")))).toBe(true);
    expect(RECONNECT_MARKER_PATTERN.test(pathAndSearch(reconnectUrl("/tournee?foo=bar")))).toBe(
      true,
    );
    expect(RECONNECT_MARKER_PATTERN.test(pathAndSearch(reconnectUrl("/tournee#top")))).toBe(true);
  });

  it("does not match once the marker is stripped, or a look-alike param", () => {
    expect(
      RECONNECT_MARKER_PATTERN.test(
        pathAndSearch(withoutReconnectMarker(reconnectUrl("/tournee"))),
      ),
    ).toBe(false);
    expect(RECONNECT_MARKER_PATTERN.test("/tournee?reconnect=10")).toBe(false);
    expect(RECONNECT_MARKER_PATTERN.test("/tournee?xreconnect=1")).toBe(false);
  });
});

describe("reconnectUrl", () => {
  it("adds the marker to a bare path", () => {
    expect(reconnectUrl("/tournee")).toBe("/tournee?reconnect=1");
  });

  it("adds the marker alongside existing query params", () => {
    expect(reconnectUrl("/tournee?foo=bar")).toBe("/tournee?foo=bar&reconnect=1");
  });

  it("keeps the hash after the marker", () => {
    expect(reconnectUrl("/tournee#top")).toBe("/tournee?reconnect=1#top");
  });

  it("is idempotent: already carrying the marker changes nothing", () => {
    expect(reconnectUrl("/tournee?reconnect=1")).toBe("/tournee?reconnect=1");
  });

  it("drops any origin the caller's href carried, since the SPA navigates by path", () => {
    expect(reconnectUrl("https://example.test/tournee?foo=bar")).toBe(
      "/tournee?foo=bar&reconnect=1",
    );
  });
});

describe("withoutReconnectMarker", () => {
  it("removes the marker and keeps everything else", () => {
    expect(withoutReconnectMarker("/tournee?foo=bar&reconnect=1")).toBe("/tournee?foo=bar");
  });

  it("is a no-op when the marker was never there", () => {
    expect(withoutReconnectMarker("/tournee?foo=bar")).toBe("/tournee?foo=bar");
  });

  it("leaves a bare path with no trailing '?'", () => {
    expect(withoutReconnectMarker("/tournee?reconnect=1")).toBe("/tournee");
  });
});

describe("hasReconnectMarker", () => {
  it("true when the marker is present in a search string", () => {
    expect(hasReconnectMarker("?reconnect=1")).toBe(true);
    expect(hasReconnectMarker("?foo=bar&reconnect=1")).toBe(true);
  });

  it("false when absent, or on a look-alike param", () => {
    expect(hasReconnectMarker("")).toBe(false);
    expect(hasReconnectMarker("?foo=bar")).toBe(false);
    expect(hasReconnectMarker("?reconnect=10")).toBe(false);
    expect(hasReconnectMarker("?xreconnect=1")).toBe(false);
  });
});
