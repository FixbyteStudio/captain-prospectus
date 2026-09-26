import { describe, expect, it } from "vitest";
import { copy } from "../copy";
import { heldBackMessage, hidesUpdateBanner, stripEffect, syncView } from "./sync-view";

/**
 * One case per row of the spec's I/O matrix (spec-gh-65) — the seven states in
 * `key-f8-sync.html`, decided in one place so `SyncDot`/`SyncStrip` never
 * branch on `status`/`running`/`pending` themselves.
 */
describe("syncView", () => {
  it("synced: success dot with its own name, no count, no strip", () => {
    const view = syncView({ status: "ok", running: false, pending: 0 });
    expect(view.dot).toEqual({ tone: "success", pulse: false, label: copy.sync.synced });
    expect(view.count).toBeNull();
    expect(view.strip).toBeNull();
  });

  it("waiting: warn dot + count, band-strip strip with the pending message", () => {
    const view = syncView({ status: "ok", running: false, pending: 3 });
    expect(view.dot).toEqual({ tone: "warn", pulse: false, label: copy.sync.pending(3) });
    expect(view.count).toBe(3);
    expect(view.strip).toEqual({
      tone: "band-strip",
      message: copy.sync.pending(3),
      icon: "cloud-upload",
      action: null,
      politeness: "polite",
    });
  });

  it("syncing, nothing waiting: pulsing dot, no strip", () => {
    const view = syncView({ status: "ok", running: true, pending: 0 });
    expect(view.dot).toEqual({ tone: "muted", pulse: true, label: copy.sync.syncing });
    expect(view.count).toBeNull();
    expect(view.strip).toBeNull();
  });

  it("syncing with a backlog: pulsing dot + count, waiting strip", () => {
    const view = syncView({ status: "ok", running: true, pending: 3 });
    expect(view.dot).toEqual({ tone: "muted", pulse: true, label: copy.sync.pending(3) });
    expect(view.count).toBe(3);
    expect(view.strip?.tone).toBe("band-strip");
    expect(view.strip?.message).toBe(copy.sync.pending(3));
  });

  it("offline: warn dot + count, secondary strip, no button, polite", () => {
    const view = syncView({ status: "offline", running: false, pending: 3 });
    expect(view.dot).toEqual({ tone: "warn", pulse: false, label: copy.sync.offline });
    expect(view.count).toBe(3);
    expect(view.strip).toEqual({
      tone: "secondary",
      message: copy.sync.offline,
      icon: "cloud-upload",
      action: null,
      politeness: "polite",
    });
  });

  it("failed: warn dot + count, secondary strip, no button, polite", () => {
    const view = syncView({ status: "error", running: false, pending: 3 });
    expect(view.dot).toEqual({ tone: "warn", pulse: false, label: copy.sync.failed });
    expect(view.count).toBe(3);
    expect(view.strip).toEqual({
      tone: "secondary",
      message: copy.sync.failed,
      icon: "clock",
      action: null,
      politeness: "polite",
    });
  });

  it("offline/failed still show the strip with nothing pending", () => {
    expect(syncView({ status: "offline", running: false, pending: 0 }).strip).not.toBeNull();
    expect(syncView({ status: "offline", running: false, pending: 0 }).count).toBeNull();
    expect(syncView({ status: "error", running: false, pending: 0 }).strip).not.toBeNull();
  });

  it("session expired: destructive dot + count, destructive strip, reconnect, assertive", () => {
    const view = syncView({ status: "auth", running: false, pending: 3 });
    expect(view.dot).toEqual({ tone: "destructive", pulse: false, label: copy.sync.authExpired });
    expect(view.count).toBe(3);
    expect(view.strip).toEqual({
      tone: "destructive",
      message: copy.sync.authExpired,
      icon: "x",
      action: "reconnect",
      politeness: "assertive",
    });
  });

  it("update needed: warn dot + count, warn strip, update, assertive", () => {
    const view = syncView({ status: "upgrade", running: false, pending: 3 });
    expect(view.dot).toEqual({ tone: "warn", pulse: false, label: copy.sync.upgrade });
    expect(view.count).toBe(3);
    expect(view.strip).toEqual({
      tone: "warn",
      message: copy.sync.upgrade,
      icon: "cloud-upload",
      action: "update",
      politeness: "assertive",
    });
  });

  it("session expired and update needed still carry a strip with nothing pending", () => {
    expect(syncView({ status: "auth", running: false, pending: 0 }).strip).not.toBeNull();
    expect(syncView({ status: "upgrade", running: false, pending: 0 }).strip).not.toBeNull();
  });

  it("session expired stays on its own strip and button while a retry runs, only the dot pulses", () => {
    const idle = syncView({ status: "auth", running: false, pending: 3 });
    const running = syncView({ status: "auth", running: true, pending: 3 });
    expect(running.dot).toEqual({ ...idle.dot, pulse: true });
    expect(running.strip).toEqual(idle.strip);
  });

  it("update needed stays on its own strip and button while a retry runs, only the dot pulses", () => {
    const idle = syncView({ status: "upgrade", running: false, pending: 3 });
    const running = syncView({ status: "upgrade", running: true, pending: 3 });
    expect(running.dot).toEqual({ ...idle.dot, pulse: true });
    expect(running.strip).toEqual(idle.strip);
  });

  it("offline/failed stay on their own strip while a retry runs, only the dot pulses", () => {
    const offlineIdle = syncView({ status: "offline", running: false, pending: 3 });
    const offlineRunning = syncView({ status: "offline", running: true, pending: 3 });
    expect(offlineRunning.dot).toEqual({ ...offlineIdle.dot, pulse: true });
    expect(offlineRunning.strip).toEqual(offlineIdle.strip);

    const failedIdle = syncView({ status: "error", running: false, pending: 0 });
    const failedRunning = syncView({ status: "error", running: true, pending: 0 });
    expect(failedRunning.dot).toEqual({ ...failedIdle.dot, pulse: true });
    expect(failedRunning.strip).toEqual(failedIdle.strip);
  });

  it("only status ok draws the muted syncing view while running", () => {
    expect(syncView({ status: "ok", running: true, pending: 0 }).dot.tone).toBe("muted");
    expect(syncView({ status: "offline", running: true, pending: 0 }).dot.tone).toBe("warn");
    expect(syncView({ status: "error", running: true, pending: 0 }).dot.tone).toBe("warn");
  });

  it("hides the update banner only while the update-needed strip shows", () => {
    expect(hidesUpdateBanner(syncView({ status: "upgrade", running: false, pending: 0 }))).toBe(
      true,
    );
    for (const status of ["ok", "offline", "error", "auth"] as const) {
      expect(hidesUpdateBanner(syncView({ status, running: false, pending: 3 }))).toBe(false);
    }
  });
});

describe("stripEffect", () => {
  it("reconnect always navigates to the marker URL, whatever the build's state", () => {
    expect(stripEffect("reconnect", false, "/tournee")).toEqual({
      kind: "navigate",
      to: "/tournee?reconnect=1",
    });
    expect(stripEffect("reconnect", true, "/tournee")).toEqual({
      kind: "navigate",
      to: "/tournee?reconnect=1",
    });
  });

  it("update takes a build already waiting", () => {
    expect(stripEffect("update", true, "/tournee")).toEqual({ kind: "apply-update" });
  });

  it("update reloads when the browser has not noticed a build yet", () => {
    expect(stripEffect("update", false, "/tournee")).toEqual({ kind: "reload" });
  });
});

describe("heldBackMessage", () => {
  it("says nothing when no other identity's rows are queued", () => {
    expect(heldBackMessage(0)).toBeNull();
  });

  it("names the count apart from the pending one", () => {
    expect(heldBackMessage(2)).toBe(copy.sync.heldBack(2));
    expect(heldBackMessage(2)).not.toBe(copy.sync.pending(2));
  });
});
