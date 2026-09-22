import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A plain `<label>`, not Radix's.
 *
 * shadcn ships this on `@radix-ui/react-label`, whose only addition over the
 * element is forwarding clicks from non-label elements. This component is used
 * on the field route (ADR-0018), and ADR-0015's rule applies unchanged there:
 * a native `<label htmlFor>` is **not** behaviour the platform lacks — it
 * already associates the control, announces it, and extends the tap target,
 * from the browser, for nothing. `src/client/ui/field-controls.tsx` records
 * what Radix costs this route when it is imported for exactly that reason.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
