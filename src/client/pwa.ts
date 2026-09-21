/**
 * Service worker registration — ADR-0004, roadmap M2.
 *
 * `vite.config.ts` sets `registerType: "prompt"`, which means the plugin builds
 * the worker but never activates a new one behind the agent's back. That is the
 * right default here: a reload mid-visit would be a lost visit if the form were
 * not already writing to the outbox, and an agent halfway through a round
 * should decide when to take an update.
 *
 * The exception is a 426 from the sync endpoint. There the server is refusing
 * the build's payload entirely, so waiting for a convenient moment only means
 * the outbox stops draining. `applyUpdateNow` takes the update immediately —
 * and takes nothing else: INVARIANT 5, an update never clears the outbox.
 */
import { useRegisterSW } from "virtual:pwa-register/react";

export type PwaState = {
  /** A new build is waiting. The agent is asked, not interrupted. */
  needRefresh: boolean;
  /** Everything needed to run with no network is cached. */
  offlineReady: boolean;
  /** Activate the waiting worker and reload. */
  update: () => void;
  /** Dismiss the prompt without updating; it returns on the next check. */
  dismiss: () => void;
};

export function usePwa(): PwaState {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();

  return {
    needRefresh,
    offlineReady,
    update: () => void updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  };
}
