import { LogOutIcon } from "lucide-react";
import { copy } from "../copy";
import { initials } from "../format";
import { LOGOUT_PATH } from "./access-logout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/**
 * The top bar's avatar menu (GH #64). "Se déconnecter" is a real `<a>` to
 * `/cdn-cgi/access/logout`, not a router `Link`: the service worker answers
 * every navigation with the precached shell (`navigateFallback`), so a SPA
 * navigation would never reach Access at all. `vite.config.ts`'s
 * `navigateFallbackDenylist` exempts `/cdn-cgi/` (GH #76) so this one anchor's
 * click goes to the network instead — the same trick "Se reconnecter" uses
 * for its own URL (docs/domains/identity-access.md).
 */
export function AccountMenu({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={copy.account.menu(email)}
          // Same classes as the field band's static avatar (App.tsx) — the
          // two must look identical, only one of them opens a menu.
          className="bg-primary text-primary-foreground ring-primary-edge flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset"
        >
          {initials(email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-muted-foreground truncate font-normal">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={LOGOUT_PATH}>
            <LogOutIcon aria-hidden="true" />
            {copy.account.logout}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
