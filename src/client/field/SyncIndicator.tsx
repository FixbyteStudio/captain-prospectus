/**
 * Sync as a standing fact, not an event — docs/design.md, "Sync is ambient,
 * never a toast".
 *
 * An agent's pending count stays true for as long as there is no signal,
 * sometimes hours. A toast shows it for four seconds and then lies by
 * omission, so this is in two permanent places instead: a dot and a count in
 * the band, and a strip that appears under it only when there is something to
 * say.
 */
import { copy } from "../copy";
import { cn } from "../lib/utils";
import type { SyncStatus } from "./sync";
import { useSyncState } from "./useSync";

/** Every non-ok status has a line saying what happened and what to do. */
const MESSAGES: Readonly<Record<Exclude<SyncStatus, "ok">, string>> = {
  offline: copy.sync.offline,
  auth: copy.sync.authExpired,
  upgrade: copy.sync.upgrade,
  error: copy.sync.failed,
};

/** The dot in the band. Colour is never the only signal — it carries a count. */
export function SyncDot() {
  const { status, running, pending } = useSyncState();

  return (
    <span
      className="text-band-muted flex shrink-0 items-center gap-1.5 text-xs"
      // The count is in the accessible name; the dot is decoration over it.
      aria-label={running ? copy.sync.syncing : copy.sync.pending(pending)}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full transition-colors",
          running && "bg-band-muted animate-pulse",
          !running && status === "ok" && "bg-success",
          !running && status !== "ok" && "bg-warn",
        )}
      />
      {pending > 0 && <span className="tnum font-medium">{pending}</span>}
    </span>
  );
}

/**
 * The strip under the band. Renders nothing when the last sync worked and
 * nothing is waiting — the quiet state is no strip at all, not an empty one.
 */
export function SyncStrip() {
  const { status, pending } = useSyncState();

  if (status === "ok") {
    if (pending === 0) return null;
    return (
      <p className="bg-secondary text-muted-foreground px-4 py-2 text-sm">
        {copy.sync.pending(pending)}
      </p>
    );
  }

  return (
    <p
      role="status"
      className="bg-warn/15 text-foreground border-warn/40 border-b px-4 py-2 text-sm"
    >
      {MESSAGES[status]}
    </p>
  );
}
