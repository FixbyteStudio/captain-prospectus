import type { ComponentType } from "react";
import { CloudUpload, Copy, FileText, Link as LinkIcon, MapPin, Store } from "lucide-react";
import { copy } from "../copy";

/** Which query's result the item's badge counts (AdminSidebar reads both). */
export type NavCountSource = "duplicates" | "orphans";

export type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  count?: NavCountSource;
};

export type NavGroup = {
  label: string;
  items: readonly NavItem[];
};

/**
 * The admin sidebar's groups and order — GH #63. nav.test.ts checks these
 * paths against a hand-copied list of the six routes AdminApp.tsx renders
 * under `/admin/*` today — it does not read AdminApp.tsx, so update both
 * together if a route there ever changes.
 *
 * Pilotage, Tableau de bord and Tournée du jour are not here on purpose: this
 * story's "Never" list keeps them out until their screens ship.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: copy.nav.groups.prospects,
    items: [
      { label: copy.nav.prospects, path: "/admin/prospects", icon: Store },
      { label: copy.nav.import, path: "/admin/import", icon: CloudUpload },
      { label: copy.nav.duplicates, path: "/admin/doublons", icon: Copy, count: "duplicates" },
    ],
  },
  {
    label: copy.nav.groups.terrain,
    items: [
      { label: copy.nav.visits, path: "/admin/visites", icon: MapPin },
      { label: copy.nav.orphans, path: "/admin/a-rattacher", icon: LinkIcon, count: "orphans" },
      { label: copy.nav.scripts, path: "/admin/scripts", icon: FileText },
    ],
  },
];

/** A badge shows only when there really is something waiting (I/O matrix, GH #63). */
export function badgeCount(n: number | undefined): number | null {
  return n ? n : null;
}

/**
 * The length of a queue query's list, or `undefined` while it is loading or has
 * failed — never a stale or guessed number (I/O matrix, GH #63).
 */
export function queueCount<T>(
  query: { isSuccess: boolean; data?: T },
  list: (data: T) => readonly unknown[],
): number | undefined {
  return query.isSuccess && query.data !== undefined ? list(query.data).length : undefined;
}

/** Same rule as NavLink's own: the item's path, or anything under it. */
export function isCurrent(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** The top bar breadcrumb's two variable parts (spec-gh-64). */
export type Breadcrumb = { group: string | null; page: string | null };

/**
 * Looks `pathname` up in `NAV_GROUPS` the same way the sidebar highlights its
 * current item (`isCurrent`), so the breadcrumb can never name a group or page
 * the sidebar disagrees with. A path outside every group — a typo, or a route
 * this epic has not shipped a sidebar entry for — returns both `null`, and the
 * bar falls back to the app name alone (I/O matrix, "Unknown admin path").
 */
export function breadcrumbFor(pathname: string): Breadcrumb {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((item) => isCurrent(pathname, item.path));
    if (item) return { group: group.label, page: item.label };
  }
  return { group: null, page: null };
}

/** True for the platforms that label the palette shortcut "⌘K" instead of
 * "Ctrl K" — iOS/iPadOS report "Mac" too since Safari 13 (spec-gh-64). */
function isApplePlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent);
}

/**
 * ⌘K or Ctrl+K, whatever the case (Caps Lock sends "K"), and nothing else:
 * - `key` is typed `string` on `KeyboardEvent`, but Chrome's autofill fires a
 *   synthetic keydown with it `undefined` — `.toLowerCase()` on that throws
 *   inside the global listener, so this checks the type first.
 * - Shift or Alt held turns this into a different chord (e.g. Firefox's
 *   Ctrl+Shift+K opens its console), so both must be unheld.
 * - A held chord auto-repeats keydown; without rejecting `repeat` the dialog
 *   would flicker open/closed on every repeat while the keys stay down.
 */
export function isPaletteShortcut(event: {
  key: string | undefined;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}): boolean {
  if (typeof event.key !== "string") return false;
  if (event.shiftKey || event.altKey || event.repeat) return false;
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

/** The search button's shortcut hint, read from `navigator.userAgent` at the
 * call site so this stays a pure, testable function. */
export function shortcutHint(userAgent: string): string {
  return isApplePlatform(userAgent) ? "⌘K" : "Ctrl K";
}
