/**
 * A tab tap unmounts whichever field form is open, so it must not silently
 * discard what the agent typed (#74, spec-gh-66). The open form registers its
 * `formState.isDirty` here; `FieldTabs` reads it on the tab's own click and
 * opens a confirmation before navigating away from unsaved input.
 *
 * `shouldAsk` is the pure part, tested without a DOM. The context plumbing
 * (`LeaveGuardProvider`, `useRegisterDirty`, `useLeaveGuard`) is only reachable
 * through JSX and so untested, like the rest of this repo's context wiring.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isCurrentTab } from "./tabs";

type LeaveGuardContextValue = {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
};

const LeaveGuardContext = createContext<LeaveGuardContextValue>({
  dirty: false,
  setDirty: () => {},
});

/** Wraps the field band and its routes, so the tab bar and the open form share one flag. */
export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const value = useMemo(() => ({ dirty, setDirty }), [dirty]);
  return <LeaveGuardContext.Provider value={value}>{children}</LeaveGuardContext.Provider>;
}

/** `FieldTabs` reads this to decide whether a tap needs to ask first. */
export function useLeaveGuard(): { dirty: boolean } {
  const { dirty } = useContext(LeaveGuardContext);
  return { dirty };
}

/**
 * A field form calls this with its own `formState.isDirty` on every render.
 * Unmounting clears the flag unconditionally, so leaving by any route — a
 * confirmed tab tap, the browser back button, a save's own `navigate()` —
 * never leaves a stale "dirty" for the screen that mounts next.
 */
export function useRegisterDirty(dirty: boolean): void {
  const { setDirty } = useContext(LeaveGuardContext);
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
}

/**
 * Whether tapping `to` while `current` is open should ask first. Tapping the
 * already-current tab never navigates, so it never asks either (I/O matrix,
 * spec-gh-66) — that row exists here, not just as a UI accident, because a
 * dirty form's own tab must stay silent. "Already current" is `isCurrentTab`,
 * the same subtree rule the bar highlights with — not exact string equality
 * — so a tab that reads as current (`/tournee/nouveau/` for Ajouter) never
 * asks either, even though the pathname itself differs from `to`.
 */
export function shouldAsk({
  dirty,
  to,
  current,
}: {
  dirty: boolean;
  to: string;
  current: string;
}): boolean {
  return dirty && !isCurrentTab(current, to);
}
