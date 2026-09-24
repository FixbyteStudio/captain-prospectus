import { copy } from "./copy";
import { Alert, AlertTitle } from "@/ui/alert";
import { buttonVariants } from "@/ui/button-variants";
import type { PwaState } from "./pwa";

/**
 * The mark and wordmark, shared by the field band and the admin sidebar header.
 * `subtitle` is the field band's meta line naming the current tab; the admin
 * sidebar leaves it unset.
 */
export function BandBrand({ subtitle }: { subtitle?: string }) {
  return (
    <>
      <img src="/mark.svg" alt="" className="h-7 w-auto shrink-0" />
      {/* min-w-0 lets this shrink below its content's width instead of
          pushing the count pill and avatar off a 320px band; the lines
          truncate rather than wrap or overflow. */}
      <span className="flex min-w-0 flex-col justify-center leading-tight">
        <span className="text-heading truncate">{copy.appName}</span>
        {subtitle && <span className="text-meta text-band-muted truncate">{subtitle}</span>}
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
    // A new build waiting is not urgent — the agent decides when — so this
    // overrides Alert's default role="alert" with the quieter "status".
    <Alert role="status" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>{copy.update.available}</AlertTitle>
      <div className="col-start-2 mt-2 flex gap-2">
        <button
          type="button"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
          onClick={dismiss}
        >
          {copy.update.dismiss}
        </button>
        <button type="button" className={buttonVariants({ size: "sm" })} onClick={update}>
          {copy.update.apply}
        </button>
      </div>
    </Alert>
  );
}
