/**
 * Sync as a standing fact, not an event — docs/design.md, "Sync is ambient,
 * never a toast".
 *
 * An agent's pending count stays true for as long as there is no signal,
 * sometimes hours. A toast shows it for four seconds and then lies by
 * omission, so this is in two permanent places instead: a dot and a count in
 * the band, and a strip that appears under it only when there is something to
 * say.
 *
 * Every state is decided once, in `sync-view.ts`; this file only draws what
 * it returns.
 */
import { ClockIcon, CloudUploadIcon, XIcon, type LucideIcon } from "lucide-react";
import { copy } from "../copy";
import { cn } from "../lib/utils";
import { buttonVariants } from "@/ui/button-variants";
import type { PwaState } from "../pwa";
import {
  stripEffect,
  syncView,
  type SyncDotTone,
  type SyncIcon,
  type SyncStripTone,
  type SyncView,
} from "./sync-view";
import { useSyncState } from "./useSync";

/**
 * `?sync=<state>` forces one of the seven states, dev-only, so each can be
 * checked by eye against `key-f8-sync.html` without waiting for the network
 * or the outbox to be in the right shape. Built only inside the `DEV` branch
 * and looked up with `Object.hasOwn`, so this table costs nothing in
 * production and `?sync=constructor` cannot return a prototype function
 * (spec-gh-65 loop-1 finding #9).
 */
function forcedView(): SyncView | null {
  if (!import.meta.env.DEV) return null;
  const key = new URLSearchParams(window.location.search).get("sync");
  if (!key) return null;

  const table: Readonly<Record<string, SyncView>> = {
    synced: syncView({ status: "ok", running: false, pending: 0 }),
    waiting: syncView({ status: "ok", running: false, pending: 3 }),
    syncing: syncView({ status: "ok", running: true, pending: 0 }),
    offline: syncView({ status: "offline", running: false, pending: 3 }),
    failed: syncView({ status: "error", running: false, pending: 3 }),
    auth: syncView({ status: "auth", running: false, pending: 3 }),
    upgrade: syncView({ status: "upgrade", running: false, pending: 3 }),
  };
  if (!Object.hasOwn(table, key)) return null;
  return table[key] ?? null;
}

/** Shared by `SyncDot`, `SyncStrip` and `App` (which hides the update banner). */
export function useSyncView(): SyncView {
  const { status, running, pending } = useSyncState();
  return forcedView() ?? syncView({ status, running, pending });
}

const DOT_TONE: Readonly<Record<SyncDotTone, string>> = {
  success: "bg-success",
  warn: "bg-warn",
  muted: "bg-band-muted",
  destructive: "bg-destructive",
};

/** The dot in the band. Colour is never the only signal — it carries a count
 * pill next to it, and its own accessible name besides. */
export function SyncDot() {
  const view = useSyncView();

  const dot = (
    <span
      role="img"
      aria-label={view.dot.label}
      className={cn(
        "size-2 rounded-full transition-colors",
        DOT_TONE[view.dot.tone],
        // The halo only reads as motion alongside the pulse; without it a
        // static ring would just look like a second, wrong-coloured dot.
        view.dot.pulse && "ring-band-muted/35 animate-pulse ring-4",
      )}
    />
  );

  if (view.count === null) return dot;

  return (
    <span className="bg-band-accent flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5">
      {dot}
      <span className="tnum text-band-foreground text-xs font-medium">{view.count}</span>
    </span>
  );
}

const STRIP_ICON: Readonly<Record<SyncIcon, LucideIcon>> = {
  "cloud-upload": CloudUploadIcon,
  clock: ClockIcon,
  x: XIcon,
};

const STRIP_TONE: Readonly<Record<SyncStripTone, string>> = {
  "band-strip": "bg-band-strip text-band-foreground",
  secondary: "bg-secondary text-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  // --on-destructive backs both fills (docs/design.md's colour table), so the
  // same utility is correct on warn too.
  warn: "bg-warn text-destructive-foreground",
};

/**
 * The strip under the band. Two regions, always mounted — switching which one
 * is live (`aria-live="polite"` vs `"assertive"`) by unmounting a single strip
 * would make a screen reader treat the new one as a region it has never seen,
 * which is exactly the "session just expired" moment that must announce.
 */
export function SyncStrip({ pwa }: { pwa: PwaState }) {
  const view = useSyncView();
  const strip = view.strip;

  const runAction = () => {
    if (!strip?.action) return;
    const effect = stripEffect(strip.action, pwa.needRefresh, window.location.href);
    switch (effect.kind) {
      case "navigate":
        // Reconnecting needs the network; with none, leave the agent on the
        // strip (which keeps retrying on its own) instead of sending them to
        // the browser's offline error page.
        if (navigator.onLine) window.location.href = effect.to;
        return;
      case "apply-update":
        pwa.update();
        return;
      case "reload":
        window.location.reload();
    }
  };

  return (
    <>
      <StripRegion politeness="polite" strip={strip?.politeness === "polite" ? strip : null} />
      <StripRegion
        politeness="assertive"
        strip={strip?.politeness === "assertive" ? strip : null}
        onAction={runAction}
      />
    </>
  );
}

function StripRegion({
  politeness,
  strip,
  onAction,
}: {
  politeness: "polite" | "assertive";
  strip: SyncView["strip"];
  onAction?: () => void;
}) {
  const Icon = strip && STRIP_ICON[strip.icon];

  return (
    <p
      aria-live={politeness}
      className={cn(
        "flex min-h-8 items-center gap-2 px-4 py-1.5 text-xs font-medium",
        strip ? STRIP_TONE[strip.tone] : "sr-only",
      )}
    >
      {strip && Icon && (
        <>
          <Icon aria-hidden className="size-4 shrink-0" />
          <span>{strip.message}</span>
          {strip.action && (
            <button
              type="button"
              onClick={onAction}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                // Never the outline variant: its bg-background and
                // dark:border-input survive the override below (spec-gh-65
                // loop-1 finding #2 — white-on-off-white in light theme).
                "relative ml-auto shrink-0 border border-current bg-transparent text-current",
                // The strip is only 32px tall, but every field tap target is
                // still >= 48px (CLAUDE.md): a pseudo-element pads the hit
                // area rather than growing the drawn button past the strip.
                "after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']",
                "hover:bg-transparent hover:text-current focus-visible:border-current focus-visible:ring-current dark:hover:bg-transparent",
              )}
            >
              {strip.action === "reconnect" ? copy.sync.reconnect : copy.update.apply}
            </button>
          )}
        </>
      )}
    </p>
  );
}
