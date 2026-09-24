import { NavLink } from "react-router";
import { copy } from "./copy";
import { cn } from "./lib/utils";
import { buttonVariants } from "@/ui/button-variants";
import type { PwaState } from "./pwa";

/**
 * A link in the field band. The admin side has its own navy sidebar
 * (`AdminSidebar.tsx`, GH #63) rather than reusing this.
 */
export function BandLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex h-8 shrink-0 items-center rounded-md px-2.5 font-medium transition-colors",
          isActive
            ? "bg-band-foreground/10 text-band-foreground"
            : "text-band-muted hover:text-band-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

/** The mark and wordmark, shared by the field band and the admin sidebar header. */
export function BandBrand() {
  return (
    <>
      <img src="/mark.svg" alt="" className="h-7 w-auto shrink-0" />
      <span className="shrink-0 text-[0.9375rem] font-semibold tracking-[0.01em] whitespace-nowrap">
        {copy.appName}
      </span>
    </>
  );
}

/**
 * A new build is waiting. `registerType` is "prompt" (vite.config.ts), so the
 * agent decides when to take it rather than being reloaded mid-round.
 *
 * The registration itself is deliberately *not* done here. This component
 * renders only once `/api/me` has settled, and a phone whose first load fails
 * to identify would then never register a worker at all — which is exactly the
 * phone that most needs one, since without it there is nothing cached to open
 * offline next time. `App` holds the hook; this only draws the prompt.
 */
export function UpdatePrompt({ pwa }: { pwa: PwaState }) {
  const { needRefresh, update, dismiss } = pwa;
  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="bg-secondary border-border flex items-center justify-between gap-3 border-b px-4 py-2"
    >
      <span className="text-sm">{copy.update.available}</span>
      <span className="flex shrink-0 gap-2">
        <button
          type="button"
          className={buttonVariants({ size: "sm", variant: "ghost" })}
          onClick={dismiss}
        >
          {copy.update.dismiss}
        </button>
        <button type="button" className={buttonVariants({ size: "sm" })} onClick={update}>
          {copy.update.apply}
        </button>
      </span>
    </div>
  );
}
