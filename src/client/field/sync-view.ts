/**
 * The seven sync states, decided once — docs/design.md, "Sync is ambient,
 * never a toast"; `key-f8-sync.html`.
 *
 * `SyncDot` and `SyncStrip` only draw what this returns; every branch on
 * `status`/`running`/`pending` and every button's effect live here so they
 * can be tested without a DOM (spec-gh-65, loop 1: the handler wiring and the
 * dot's label were the two things review found undecided and untested in the
 * component).
 */
import { copy } from "../copy";
import { reconnectUrl } from "./reconnect-marker";
import type { SyncStatus } from "./sync";

export type SyncViewInput = {
  status: SyncStatus;
  /** True only while a round trip is in flight. */
  running: boolean;
  pending: number;
};

export type SyncDotTone = "success" | "warn" | "muted" | "destructive";
export type SyncStripTone = "band-strip" | "secondary" | "destructive" | "warn";
export type SyncIcon = "cloud-upload" | "clock" | "x";
export type SyncAction = "reconnect" | "update";

export type SyncStripView = {
  tone: SyncStripTone;
  message: string;
  icon: SyncIcon;
  action: SyncAction | null;
  politeness: "polite" | "assertive";
};

export type SyncView = {
  /** `label` is this state's accessible name — every state has one, synced
   * included, because `role="img"` sits on the dot itself (spec-gh-65 #4). */
  dot: { tone: SyncDotTone; pulse: boolean; label: string };
  /** Shown in the band pill whenever it is not null; null hides the pill. */
  count: number | null;
  /** Null means no strip at all — the quiet state is no strip, not an empty one. */
  strip: SyncStripView | null;
};

function waitingStrip(pending: number): SyncStripView {
  return {
    tone: "band-strip",
    message: copy.sync.pending(pending),
    icon: "cloud-upload",
    action: null,
    politeness: "polite",
  };
}

const AUTH_STRIP: SyncStripView = {
  tone: "destructive",
  message: copy.sync.authExpired,
  icon: "x",
  action: "reconnect",
  politeness: "assertive",
};

const UPGRADE_STRIP: SyncStripView = {
  tone: "warn",
  message: copy.sync.upgrade,
  icon: "cloud-upload",
  action: "update",
  politeness: "assertive",
};

const OFFLINE_STRIP: SyncStripView = {
  tone: "secondary",
  message: copy.sync.offline,
  icon: "cloud-upload",
  action: null,
  politeness: "polite",
};

const FAILED_STRIP: SyncStripView = {
  tone: "secondary",
  message: copy.sync.failed,
  icon: "clock",
  action: null,
  politeness: "polite",
};

/**
 * The update-needed strip and the `UpdatePrompt` banner say the same fact, so
 * the banner steps aside while the strip shows it.
 */
export function hidesUpdateBanner(view: SyncView): boolean {
  return view.strip?.action === "update";
}

export function syncView({ status, running, pending }: SyncViewInput): SyncView {
  const count = pending > 0 ? pending : null;

  // Every non-ok status keeps its own tone, label and strip regardless of
  // `running` — only the dot pulses. `nextDelayMs` (sync-schedule.ts) retries
  // all of them on backoff, and swapping the strip (or dropping it) on every
  // tick would flicker the offline/failed strip and, worse, re-announce and
  // drop the button on the assertive session-expired/update-needed ones
  // (spec-gh-65 loop-1 finding #3, widened on review to every status).
  if (status === "auth") {
    return {
      dot: { tone: "destructive", pulse: running, label: copy.sync.authExpired },
      count,
      strip: AUTH_STRIP,
    };
  }

  if (status === "upgrade") {
    return {
      dot: { tone: "warn", pulse: running, label: copy.sync.upgrade },
      count,
      strip: UPGRADE_STRIP,
    };
  }

  if (status === "offline") {
    return {
      dot: { tone: "warn", pulse: running, label: copy.sync.offline },
      count,
      strip: OFFLINE_STRIP,
    };
  }

  if (status === "error") {
    return {
      dot: { tone: "warn", pulse: running, label: copy.sync.failed },
      count,
      strip: FAILED_STRIP,
    };
  }

  // status === "ok": a fresh round trip in flight draws as "syncing", even
  // with a backlog behind it — unlike the statuses above, there is no
  // button or assertive region here to lose on this transition.
  if (running) {
    return {
      dot: {
        tone: "muted",
        pulse: true,
        label: pending > 0 ? copy.sync.pending(pending) : copy.sync.syncing,
      },
      count,
      strip: pending > 0 ? waitingStrip(pending) : null,
    };
  }

  if (pending > 0) {
    return {
      dot: { tone: "warn", pulse: false, label: copy.sync.pending(pending) },
      count,
      strip: waitingStrip(pending),
    };
  }
  return {
    dot: { tone: "success", pulse: false, label: copy.sync.synced },
    count: null,
    strip: null,
  };
}

/* ------------------------------------------------------------- strip effect */

export type StripEffect =
  { kind: "navigate"; to: string } | { kind: "apply-update" } | { kind: "reload" };

/**
 * What tapping the strip's one button does, decided here rather than in the
 * component so flipping the choice needs a failing test (spec-gh-65 #5). The
 * destination is computed here too, not just the effect's name, so swapping
 * in a plain `reload()` for the reconnect navigation would fail a test.
 *
 * "Mettre à jour" takes a build already waiting; otherwise the browser has not
 * noticed one yet, so a plain reload is what lets the *next* sync's 426 call
 * `applyUpdateNow` again from a fresh page load (`src/client/pwa.ts`).
 */
export function stripEffect(action: SyncAction, needRefresh: boolean, href: string): StripEffect {
  if (action === "reconnect") return { kind: "navigate", to: reconnectUrl(href) };
  return needRefresh ? { kind: "apply-update" } : { kind: "reload" };
}
