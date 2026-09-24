import { useEffect, useState, type ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../ui/sidebar";

/**
 * ≥ 1024px gets the full sidebar; below that the icon rail and the Sheet
 * split at shadcn's own 768px (`use-mobile.ts`). GH #63: the three widths are
 * a layout rule, not a persisted preference, so `open` tracks this query
 * rather than a cookie. A manual toggle (the trigger, or Ctrl/⌘+B) overrides
 * it until the query next changes.
 */
const DESKTOP_QUERY = "(min-width: 1024px)";

function useDesktopOpen() {
  const [open, setOpen] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => setOpen(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return [open, setOpen] as const;
}

/**
 * The admin frame: a navy sidebar (full / icon rail / Sheet drawer, GH #63)
 * and a 56px top-bar slot that today holds only the sidebar toggle — the
 * breadcrumb, search, notifications, theme toggle and avatar arrive with the
 * top bar (story 1.5).
 *
 * `AdminLayout` lives in this module rather than `App.tsx` so it ships only in
 * the lazy `AdminApp-*` chunk (ADR-0019) — a field agent never downloads it.
 */
export function AdminLayout({ banner, children }: { banner: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useDesktopOpen();

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <AdminSidebar />
      <SidebarInset>
        <header className="safe-top border-border bg-card flex h-14 shrink-0 items-center border-b px-3">
          <SidebarTrigger />
        </header>
        {banner}
        <main className="safe-bottom px-4 py-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
