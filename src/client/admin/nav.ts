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
