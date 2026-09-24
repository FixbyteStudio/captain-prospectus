import { useEffect, useState } from "react";

/** shadcn Sidebar's own breakpoint: below this, the sidebar is a Sheet. */
const MOBILE_BREAKPOINT = 768;

// The exact complement of Tailwind's md: (>= 768px), not max-width: 767px —
// that range syntax leaves fractional widths between 767 and 768px (browser
// zoom) matching neither query, so no sidebar renders at all.
const MOBILE_QUERY = `(width < ${MOBILE_BREAKPOINT}px)`;

/**
 * Reads the media query rather than upstream's `window.innerWidth`: on a phone,
 * content wider than the screen widens the layout viewport, so innerWidth can
 * read 1,000px at 390 and the drawer would never open.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
