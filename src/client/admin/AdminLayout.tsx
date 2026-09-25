import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { AdminSidebar } from "./AdminSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { TopBar } from "./TopBar";

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
 * and a 56px top bar (the sidebar toggle plus `TopBar`'s breadcrumb, search,
 * notifications, theme toggle and avatar, GH #64).
 *
 * `AdminLayout` lives in this module rather than `App.tsx` so it ships only in
 * the lazy `AdminApp-*` chunk (ADR-0019) — a field agent never downloads it.
 */
export function AdminLayout({
  banner,
  children,
  email,
}: {
  banner: ReactNode;
  children: ReactNode;
  email: string;
}) {
  const [open, setOpen] = useDesktopOpen();
  const { pathname } = useLocation();

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <AdminSidebar />
      <SidebarInset>
        <header className="safe-top border-border bg-card flex h-14 shrink-0 items-center gap-3 border-b px-3">
          <SidebarTrigger />
          <TopBar pathname={pathname} email={email} />
        </header>
        {banner}
        <main className="px-4 pt-6 pb-page">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
