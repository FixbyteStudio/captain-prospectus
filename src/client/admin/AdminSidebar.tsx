import { useEffect } from "react";
import { NavLink, useLocation } from "react-router";
import { BandBrand } from "../Band";
import { copy } from "../copy";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import { NAV_GROUPS, badgeCount, isCurrent, queueCount, type NavCountSource } from "./nav";
import { useDuplicates, useOrphans } from "./queries";

/**
 * The count behind each badge, `undefined` while its query is loading or has
 * failed — `badgeCount` then hides the badge rather than showing a stale or
 * wrong number (I/O matrix, GH #63). Both hooks are the ones DuplicatesScreen
 * and OrphansScreen already use, so the sidebar's number is always theirs.
 */
function useNavCounts(): Record<NavCountSource, number | undefined> {
  const duplicates = useDuplicates();
  const orphans = useOrphans();
  return {
    duplicates: queueCount(duplicates, (data) => data.pairs),
    orphans: queueCount(orphans, (data) => data.visits),
  };
}

/**
 * The navy admin sidebar — GH #63. Full at ≥ 1024px, an icon rail from 768 to
 * 1023px (a Tooltip names each item), and a Sheet drawer below that (closed on
 * navigation). `AdminLayout` owns which of the three `open`/`isMobile` picks.
 */
export function AdminSidebar() {
  const { pathname } = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const counts = useNavCounts();
  const rail = state === "collapsed" && !isMobile;

  // Closes the drawer for every navigation, including browser Back and the
  // Android back gesture — a nav item's own onClick only caught a tap.
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return (
    <Sidebar>
      {/* In the rail the header clips to the mark alone, centred in 3rem. */}
      <SidebarHeader className={rail ? "px-2.5" : undefined}>
        <BandBrand />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = isCurrent(pathname, item.path, item.end);
                  const count = badgeCount(item.count ? counts[item.count] : undefined);
                  const accessibleLabel =
                    count === null ? item.label : copy.nav.withCount(item.label, count);

                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={rail ? accessibleLabel : undefined}
                      >
                        <NavLink to={item.path} end={item.end} aria-label={accessibleLabel}>
                          <item.icon aria-hidden="true" />
                          {!rail && <span className="truncate">{item.label}</span>}
                          {!rail && count !== null && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                          {rail && count !== null && (
                            <span
                              aria-hidden="true"
                              className="bg-warn absolute top-1 left-5 size-2 rounded-full"
                            />
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
