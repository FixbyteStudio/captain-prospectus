import { BellIcon } from "lucide-react";
import { copy } from "../copy";
import { Button } from "../ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";
import { AccountMenu } from "./AccountMenu";
import { breadcrumbFor } from "./nav";
import { SearchPalette } from "./SearchPalette";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The top bar's breadcrumb (GH #64): "Captain Prospectus › {group} › {page}"
 * at ≥1024px, "{group} › {page}" from 768 to 1023px, and just "{page}" (in
 * semibold) below that — three plain `BreadcrumbItem`s hidden per breakpoint
 * rather than three separately-built strings, so the DOM the width query
 * matches against is always the one the a11y tree also has. An unmatched
 * path (`breadcrumbFor` found no group or page) leaves the app name visible
 * at every width instead (I/O matrix, "Unknown admin path").
 */
function TopBarBreadcrumb({ pathname }: { pathname: string }) {
  const { group, page } = breadcrumbFor(pathname);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className={page ? "hidden lg:inline-flex" : undefined}>
          <span>{copy.appName}</span>
        </BreadcrumbItem>
        {group && (
          <>
            <BreadcrumbSeparator className="hidden lg:inline-flex" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <span>{group}</span>
            </BreadcrumbItem>
          </>
        )}
        {page && (
          <>
            {group && <BreadcrumbSeparator className="hidden md:inline-flex" />}
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate font-semibold md:font-normal">
                {page}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * The admin top bar (GH #64), rendered beside `SidebarTrigger` in
 * `AdminLayout`. Left to right: the breadcrumb, then a flexible gap, then
 * search, the (disabled) notifications bell, the theme toggle and the
 * avatar menu — the order the spec's mockup fixes.
 */
export function TopBar({ pathname, email }: { pathname: string; email: string }) {
  return (
    <>
      <TopBarBreadcrumb pathname={pathname} />
      <div className="ml-auto flex items-center gap-1">
        <SearchPalette />
        <Button variant="ghost" size="icon-sm" aria-label={copy.notifications.label} disabled>
          <BellIcon aria-hidden="true" />
        </Button>
        <ThemeToggle />
        <AccountMenu email={email} />
      </div>
    </>
  );
}
