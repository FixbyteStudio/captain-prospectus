/**
 * Draws `tabs.ts` as DOM (spec-gh-66, DESIGN.md › Tab bar): fixed at the
 * bottom on `card` below 768px, inline in the band from 768px. One
 * component, two layouts, not two — `position: fixed` ignores where an
 * element sits in the DOM, so the same `<nav>` can live inside the band's
 * row and still pin to the bottom of a phone screen; only its classes switch
 * at the breakpoint. Placed where the band's old `BandLink` pair was
 * (`App.tsx`).
 *
 * This bar is the field's bottommost fixed element below 768px and owns the
 * `.safe-bottom` inset there. A screen's own fixed action bar (`VisitScreen`,
 * `AddProspectScreen`) does **not** stack on top of it — a z-index only picks
 * which one paints, not whether they collide, and this bar's DOM position
 * (inside the header, before `<main>`) would in fact lose that fight and
 * paint under the action bar, not over it. Instead the action bar is offset
 * up by this bar's own height (`.above-tab-bar`, `app.css`), so the two sit
 * stacked, never overlapped, and neither ever hides the other's button.
 *
 * A tap that would discard a dirty form asks first instead of navigating
 * straight away (`leave-guard.ts`, #74).
 */
import { useState, type MouseEvent } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { copy } from "../copy";
import { cn } from "../lib/utils";
import { buttonVariants } from "@/ui/button-variants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { shouldAsk, useLeaveGuard } from "./leave-guard";
import { fieldTabs, isCurrentTab, type FieldTab } from "./tabs";

export function FieldTabs({ isAdmin }: { isAdmin: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { dirty } = useLeaveGuard();
  const tabs = fieldTabs({ isAdmin });

  /** The tab a dirty form's tap is waiting on a confirm for; null closes the dialog. */
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, tab: FieldTab) => {
    if (!shouldAsk({ dirty, to: tab.path, current: pathname })) return;
    event.preventDefault();
    setPendingTo(tab.path);
  };

  return (
    <>
      {/* The safe-area inset and the card fill live on this outer wrapper,
          not on the `<nav>` itself: `<nav>` also carries `h-tab-bar-height`,
          and preflight's `box-sizing: border-box` would otherwise squeeze
          that height to fit the inset *inside* it, shrinking every tab below
          its 48px target on a notched phone (same split as the band itself —
          `.safe-top` on `App.tsx`'s `<header>`, `h-band-height` on the row
          inside it). `md:contents` below removes this wrapper's own box
          entirely from 768px, so its fixed position, fill and border stop
          applying and the `<nav>` becomes the real (and only) flex item in
          the band's row. */}
      <div
        className={cn(
          "safe-bottom bg-card border-border fixed inset-x-0 bottom-0 z-40 border-t",
          "md:contents",
        )}
      >
        <nav
          aria-label={copy.nav.tabsLabel}
          className={cn(
            "flex h-tab-bar-height",
            "md:ml-auto md:h-auto md:w-auto md:flex-none md:items-center md:gap-1",
          )}
        >
          {tabs.map((tab) => {
            const current = isCurrentTab(pathname, tab.path);
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                aria-label={tab.ariaLabel}
                aria-current={current ? "page" : undefined}
                onClick={(event) => handleClick(event, tab)}
                className={cn(
                  "flex min-h-touch min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1.5 transition-colors",
                  // From 768px the pill moves to the whole row — gold fill, navy
                  // text, reading like the sidebar's own current item
                  // (design.md, Layout) — rather than staying on the icon alone.
                  "md:h-band-height md:flex-none md:flex-row md:gap-2 md:rounded-md md:px-3 md:pt-0",
                  current
                    ? "md:bg-primary md:text-primary-foreground md:ring-1 md:ring-inset md:ring-primary-edge"
                    : "md:hover:bg-band-accent",
                )}
              >
                <span
                  className={cn(
                    // 52×30, off the same 0.25rem spacing scale as every
                    // other dimension here (13 and 7.5 steps) rather than an
                    // arbitrary pixel value.
                    "flex h-7.5 w-13 items-center justify-center rounded-full",
                    current
                      ? "bg-primary text-primary-foreground ring-primary-edge ring-1 ring-inset"
                      : "text-muted-foreground",
                    // The row itself carries the colour from 768px (see above),
                    // never band-muted: sidebar item text stays band-foreground
                    // in every state, group labels are the only band-muted use.
                    "md:h-auto md:w-auto md:rounded-none md:bg-transparent md:p-0 md:text-inherit md:ring-0",
                  )}
                >
                  <tab.icon aria-hidden="true" className="size-6 md:size-5" />
                </span>
                <span
                  className={cn(
                    // w-full + truncate: a tight phone (320px, three tabs)
                    // clips "Tableau de bord" with an ellipsis instead of
                    // wrapping it out of the bar's fixed height.
                    "text-meta w-full truncate text-center",
                    current ? "text-foreground font-semibold" : "text-muted-foreground",
                    "md:w-auto md:text-label md:font-medium md:text-inherit",
                  )}
                >
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* One dialog for the whole bar: only one tap can be pending at a time. */}
      <AlertDialog
        open={pendingTo !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.nav.leaveGuard.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.nav.leaveGuard.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={buttonVariants({ variant: "outline", size: "touch" })}>
              {copy.nav.leaveGuard.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive", size: "touch" })}
              onClick={() => {
                if (pendingTo) navigate(pendingTo);
              }}
            >
              {copy.nav.leaveGuard.leave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
