/**
 * The field tab bar's contents — GH #66. Pure so the matrix in the spec can be
 * asserted without a DOM: this repo has no DOM test harness, so anything only
 * reachable through JSX (FieldTabs.tsx) is untested.
 */
import type { ComponentType } from "react";
import { LayoutGrid, MapPinPlus, Route } from "lucide-react";
import { copy } from "../copy";

export type FieldTab = {
  path: string;
  label: string;
  /** The tab's accessible name. Same string as `label` today, kept distinct
   * because a future tab's icon may need a fuller name than its short label. */
  ariaLabel: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  /**
   * `FieldTabs` passes this straight to `NavLink`'s own `end` prop, so its
   * built-in `isActive`/`aria-current` matcher agrees with `isCurrentTab`
   * exactly — true only for the index tab `/tournee`, which must not also
   * match its own subtree.
   */
  end: boolean;
};

/**
 * Tournée and Ajouter for every role; Tableau de bord last, only for an admin
 * who is online (the caller passes the same `isAdmin` App.tsx already
 * computes — `me.role === "admin" && !offline` — never a second signal).
 *
 * No Carte tab: epic-field-screens ships that screen, and nothing here links
 * to a screen that does not exist yet.
 */
export function fieldTabs({ isAdmin }: { isAdmin: boolean }): readonly FieldTab[] {
  const tabs: FieldTab[] = [
    {
      path: "/tournee",
      label: copy.nav.tabs.today,
      ariaLabel: copy.nav.tabs.today,
      icon: Route,
      end: true,
    },
    {
      path: "/tournee/nouveau",
      label: copy.nav.tabs.add,
      ariaLabel: copy.nav.tabs.add,
      icon: MapPinPlus,
      end: false,
    },
  ];
  if (isAdmin) {
    tabs.push({
      path: "/admin/prospects",
      label: copy.nav.tabs.dashboard,
      ariaLabel: copy.nav.tabs.dashboard,
      icon: LayoutGrid,
      end: false,
    });
  }
  return tabs;
}

/**
 * `/tournee` is an index route, so it must match only itself — the admin
 * sidebar's "path, or anything under it" rule (`admin/nav.ts`'s `isCurrent`)
 * would also light it up on `/tournee/nouveau` and on a visit. Every other
 * tab's path is a real subtree, so it keeps that rule.
 */
export function isCurrentTab(pathname: string, path: string): boolean {
  if (path === "/tournee") return pathname === "/tournee";
  return pathname === path || pathname.startsWith(`${path}/`);
}
