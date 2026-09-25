import * as React from "react";
import { cn } from "@/lib/utils";
import * as ProgressPrimitive from "radix-ui/progress";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        // shadow-[inset...primary-edge]: the fill is 2.2:1 against the page, so
        // without its own edge the bar has no discernible boundary (WCAG
        // 1.4.11) — an inset shadow rather than a border, since the track's
        // overflow-hidden already clips it to the rounded shape (sidebar.tsx's
        // active item is the same idiom).
        className="h-full w-full flex-1 bg-primary shadow-[inset_0_0_0_1px_var(--primary-edge)] transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
