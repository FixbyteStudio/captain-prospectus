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
 * the outbox stops draining — field-operations.md: "the client then forces a
 * service worker update *without* dropping the outbox". `applyUpdateNow` is
 * that force, and it takes nothing else: INVARIANT 5, an update never clears
 * the outbox, which lives in IndexedDB and is untouched by either.
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

/**
 * Module scope, because the one caller that needs this is the sync engine,
 * which is not a component and must not depend on one being mounted.
 */
let registration: ServiceWorkerRegistration | undefined;
let updateServiceWorkerFn: ((reload?: boolean) => Promise<void>) | undefined;
let forced = false;

/**
 * Take a new build now, without asking — the 426 path only.
 *
 * Two steps, because a phone old enough to be refused may not have noticed a
 * new build exists yet: ask the browser to re-check, then activate whatever is
 * waiting. In "prompt" mode `updateServiceWorker` only posts `skipWaiting` to a
 * worker that is already waiting, so with nothing to take this is a no-op
 * rather than a reload — there is no reload loop to fall into here.
 *
 * Runs at most once per page load. After that the page has either reloaded onto
 * the new build, or there is no new build to take and re-asking every sync
 * would spend requests on nothing.
 */
export async function applyUpdateNow(): Promise<void> {
  if (forced) return;
  // Nothing has registered yet, so there is nothing to force. Returning
  // without burning the one attempt matters: a 426 answered before the
  // registration landed would otherwise disable this for the whole page load.
  if (!updateServiceWorkerFn) return;
  forced = true;

  try {
    await registration?.update();
    await updateServiceWorkerFn?.();
  } catch {
    // An unreachable or refused update is the same situation as before it was
    // attempted: the outbox waits on disk, and the agent keeps working.
  }
}

export function usePwa(): PwaState {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swUrl, r) => {
      registration = r;
    },
  });

  // Assigned on every render rather than in an effect, so `applyUpdateNow` is
  // usable from the first sync — which runs in an effect of its own, and would
  // otherwise race this one. The value is the same on every render.
  updateServiceWorkerFn = updateServiceWorker;

  return {
    needRefresh,
    offlineReady,
    update: () => void updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  };
}
