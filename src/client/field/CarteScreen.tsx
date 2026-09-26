/**
 * Carte — docs/design.md, "Carte" (spec-gh-121, GH #121).
 *
 * Full-bleed: the map fills the screen down to the tab bar. No sheet, no
 * pin-tap selection and no tablet two-pane layout yet (story 117.5 adds
 * those). Offline, the map is never created at all: Leaflet requests a tile
 * on every pan, so "no tile request offline" only holds when there is no map
 * to pan (Design Notes).
 */
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { MapIcon, RouteIcon } from "lucide-react";
import { buttonVariants } from "@/ui/button-variants";
import { copy } from "../copy";
import { cn } from "../lib/utils";
import { useOnline } from "../hooks/use-online";
import { mapPins, walkingPath } from "./round-map";
import { RoundMap } from "./RoundMap";
import { useRound } from "./useRound";

/**
 * Cancels `<main>`'s own `px-4 pt-6` (`App.tsx`) and fills the rest with a
 * height built from where this pane actually starts, not a fixed band-height
 * guess: `SyncStrip` and `UpdatePrompt` sit between the band and `<main>`
 * (`App.tsx`'s `FieldFrame`) and change height on their own — offline, a
 * pending count, an update landing — so a guess of "band height only" leaves
 * the canvas taller than the viewport under exactly the conditions a phone in
 * the field hits, sliding the re-centre control and the attribution line
 * under the tab bar. `useCarteTop` below measures the real value into
 * `--carte-top`; only the bottom term stays a fixed calc off the shell's own
 * tokens (below 768px the tab bar is fixed and owns its own safe-area inset,
 * `--spacing-tab-bar-height`, app.css:219, 437-438; from 768px the tabs move
 * into the band and the bottom margin is the page's usual one instead,
 * app.css:441-445's own `.pb-tab-bar` override, mirrored here since a
 * full-bleed canvas cannot also carry that class's padding-bottom).
 */
const FULL_BLEED = cn(
  "relative -mx-4 -mt-6",
  "h-[calc(100dvh_-_var(--carte-top,0px)_-_var(--spacing-tab-bar-height)_-_env(safe-area-inset-bottom,0px))]",
  "md:h-[calc(100dvh_-_var(--carte-top,0px)_-_var(--spacing)*6)]",
);

/**
 * Where this pane's own top edge actually sits, written to `--carte-top` on
 * the element itself so `FULL_BLEED`'s `calc()` can read it. Re-measured on
 * `resize` and on a `ResizeObserver` over `document.body`, since the strip
 * and the update prompt change the body's layout without this component's
 * own props changing at all.
 */
function useCarteTop<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      element.style.setProperty("--carte-top", `${top}px`);
    };
    measure();

    window.addEventListener("resize", measure);
    // happy-dom has no ResizeObserver in every version this repo has run
    // against; a missing one just means the unit tests only re-measure on
    // `resize`, not on the strip's own height changing — real browsers keep
    // both.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(document.body);
    }

    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, []);

  return ref;
}

export function CarteScreen() {
  const { list, point, denied, refresh } = useRound();
  const online = useOnline();
  const paneRef = useCarteTop<HTMLDivElement>();

  if (!online) {
    return (
      <div ref={paneRef} className={cn(FULL_BLEED, "bg-secondary")}>
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="bg-card border-border w-full max-w-sm rounded-xl border p-6 text-center shadow-sm">
            <span className="bg-secondary text-muted-foreground mx-auto flex size-11 items-center justify-center rounded-lg">
              <MapIcon aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-2.5 text-base font-semibold">{copy.carte.offline}</p>
            <Link
              to="/tournee"
              className={cn(buttonVariants({ variant: "secondary", size: "touch" }), "mt-3 w-full")}
            >
              <RouteIcon aria-hidden="true" />
              {copy.carte.showList}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pins = mapPins(list.now);

  return (
    <div ref={paneRef} className={FULL_BLEED}>
      {denied && (
        <div className="bg-card border-border absolute inset-x-4 top-3 z-10 rounded-lg border p-3 shadow-sm">
          <p className="text-sm">
            {copy.today.positionDenied}{" "}
            <button type="button" onClick={refresh} className="text-foreground underline">
              {copy.today.retryPosition}
            </button>
          </p>
        </div>
      )}
      <RoundMap pins={pins} path={walkingPath(pins)} position={point} recentre={refresh} />
    </div>
  );
}
