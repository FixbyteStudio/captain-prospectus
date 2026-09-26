/**
 * The field tab bar's contents — GH #66. Pure so the matrix in the spec can be
 * asserted without a DOM, in the `unit` project. What the component does with
 * these tabs is covered separately, in `FieldTabs.test.tsx` (the `dom`
 * project, GH #83).
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
 * Tournée and Ajouter for every role; Tableau de bord last, only when the
 * caller's `adminOnline` is true — `adminAccess(...).entry` from
 * `field/identity.ts` (spec-gh-115), the tab-and-redirect gate layered on top
 * of the admin-screens one, never a second signal of its own.
 *
 * No Carte tab: epic-field-screens ships that screen, and nothing here links
 * to a screen that does not exist yet.
 */
export function fieldTabs({ adminOnline }: { adminOnline: boolean }): readonly FieldTab[] {
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
  if (adminOnline) {
    tabs.push({
      // `end: false` here, `true` for the same /admin path in `admin/nav.ts`
      // — not a disagreement: `adminOnline` is `adminAccess(...).entry`,
      // which implies `screens`, so a rendered instance of this tab is never
      // on an /admin/* route at all (App.tsx mounts AdminApp there instead);
      // `end`'s exact-vs-subtree choice is unobservable for it either way.
      path: "/admin",
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
