import type { ReactNode } from "react";
import { BandBrand, BandLink } from "../Band";
import { copy } from "../copy";

/**
 * The admin frame.
 *
 * Today the nav reuses the field band's look and today's link order; a later
 * change replaces it with the navy sidebar (full / icon rail / Sheet drawer).
 * The reserved slot below it becomes the top bar: sidebar toggle, breadcrumb,
 * search, notifications, theme toggle and avatar menu.
 *
 * `AdminLayout` lives in this module rather than `App.tsx` so it ships only in
 * the lazy `AdminApp-*` chunk (ADR-0019) — a field agent never downloads it.
 */
export function AdminLayout({ banner, children }: { banner: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="safe-top bg-band text-band-foreground flex h-12 items-center gap-3 px-4">
        <BandBrand />
        <nav className="ml-auto flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]">
          <BandLink to="/tournee">{copy.nav.today}</BandLink>
          <BandLink to="/admin/prospects">{copy.nav.prospects}</BandLink>
          <BandLink to="/admin/import">{copy.nav.import}</BandLink>
          <BandLink to="/admin/doublons">{copy.nav.duplicates}</BandLink>
          <BandLink to="/admin/a-rattacher">{copy.nav.orphans}</BandLink>
          <BandLink to="/admin/visites">{copy.nav.visits}</BandLink>
          <BandLink to="/admin/scripts">{copy.nav.scripts}</BandLink>
        </nav>
      </header>
      {/* Reserved for the top bar: sidebar toggle, breadcrumb, search,
          notifications, theme toggle, avatar menu. Empty for now. */}
      <div />
      {banner}
      <main className="safe-bottom px-4 py-6">{children}</main>
    </>
  );
}
