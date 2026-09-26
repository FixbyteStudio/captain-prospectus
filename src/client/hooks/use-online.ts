import { useEffect, useState } from "react";

/**
 * The live network signal for the admin tab and the `/` redirect
 * (spec-gh-115) — same `window` events as `useSync`'s trigger 2
 * (`field/useSync.tsx`), read directly rather than through the identity
 * snapshot so losing and regaining the network is reflected without a
 * reload. Never re-reads `navigator` after mount: a DOM test drives it by
 * dispatching `online`/`offline` events alone.
 */
export function useOnline() {
  // `!== false` rather than the bare boolean: a browser that has never
  // implemented `navigator.onLine` reports `undefined`, which must read as
  // "online" (the safe default — nothing here should hide the tab because a
  // property does not exist), not as `false`.
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
