import * as React from "react";
import { PanelLeftIcon } from "lucide-react";
import * as SlotPrimitive from "radix-ui/slot";
import { cn } from "@/lib/utils";
import { copy } from "@/copy";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

/**
 * shadcn's Sidebar, trimmed to what this app uses (GH #63): one fixed left
 * sidebar, collapsible between a full width and an icon rail, and a Sheet
 * under 768px. Upstream also ships floating/inset variants, a right side and
 * an offcanvas mode; none has a caller here, so they are cut rather than kept
 * as dead code — add one back if a screen needs it.
 *
 * `open` is always controlled by the caller (`AdminLayout`, following a media
 * query) instead of shadcn's own cookie-backed state: the three widths are a
 * layout rule, not a persisted preference, so there is no cookie write here.
 */
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}

/** Ctrl/⌘+B toggles the sidebar from anywhere in the admin frame. */
function useSidebarShortcut(toggleSidebar: () => void) {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);
}

function SidebarProvider({
  open,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((value) => !value);
    else onOpenChange(!open);
  }, [isMobile, open, onOpenChange]);

  useSidebarShortcut(toggleSidebar);

  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ state, open, isMobile, openMobile, setOpenMobile, toggleSidebar }),
    [state, open, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"div">) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          data-slot="sidebar"
          data-sidebar="sidebar"
          data-mobile="true"
          side="left"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as React.CSSProperties}
        >
          {/* The dialog title/description are screen-reader only: the sheet's
              visible header is drawn by the caller (AdminSidebar). */}
          <SheetHeader className="sr-only">
            <SheetTitle>{copy.appName}</SheetTitle>
            <SheetDescription>{copy.nav.drawerDescription}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      data-slot="sidebar"
      data-sidebar="sidebar"
      data-state={state}
      className={cn(
        "sticky top-0 hidden h-svh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear md:flex",
        state === "expanded" ? "w-(--sidebar-width)" : "w-(--sidebar-width-icon)",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const label = expanded ? copy.nav.collapseMenu : copy.nav.openMenu;

  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn("size-9", className)}
      aria-label={label}
      aria-expanded={expanded}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeftIcon />
    </Button>
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn("flex min-h-svh min-w-0 flex-1 flex-col bg-background", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-sidebar-border px-4",
        className,
      )}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto py-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col px-2", className)}
      {...props}
    />
  );
}

/** Overline in expanded mode and in the mobile drawer; a hairline in the rail only. */
function SidebarGroupLabel({ className, children, ...props }: React.ComponentProps<"div">) {
  const { state, isMobile } = useSidebar();

  if (state === "collapsed" && !isMobile) {
    return (
      <div data-slot="sidebar-group-label" className={cn("px-2 py-1.5", className)} {...props}>
        <Separator className="bg-sidebar-border" />
        <span className="sr-only">{children}</span>
      </div>
    );
  }

  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "text-overline flex h-8 shrink-0 items-center px-2 pt-2.5 text-band-muted uppercase",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sidebar-group-content" className={cn("w-full text-sm", className)} {...props} />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonClass = cn(
  "flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-label text-sidebar-foreground outline-none transition-colors",
  "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
  "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--primary-edge)]",
  "[&>svg]:size-4 [&>svg]:shrink-0",
);

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  /** Shown on hover/focus only in the icon rail (768–1023px). */
  tooltip?: string;
}) {
  const { state, isMobile } = useSidebar();
  const Comp = asChild ? SlotPrimitive.Root : "button";

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(sidebarMenuButtonClass, className)}
      {...props}
    />
  );

  if (!tooltip || state !== "collapsed" || isMobile) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** A warn pill with tabular numerals (design.md Components › Sidebar). */
function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        "tnum ml-auto inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-warn px-1.5 text-[11px] font-semibold text-destructive-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
