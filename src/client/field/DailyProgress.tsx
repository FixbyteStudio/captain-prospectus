/**
 * The day's progress line and bar — GH #119, docs/design.md "Next-stop
 * card": between the header and the next-stop card, no percentage and no
 * "restants" as text. The bar itself carries the fraction.
 */
import { Progress } from "../ui/progress";
import { copy } from "../copy";
import type { DailyProgressValue } from "./progress";

export function DailyProgress({ progress }: { progress: DailyProgressValue }) {
  if (progress.total === 0) return null;

  return (
    <div className="mt-2">
      <p className="tnum text-base font-semibold">
        {copy.today.progress(progress.n, progress.total)}
      </p>
      {/* The mock's track is `--secondary`; the vendored default is
          `bg-primary/20`, which is the gold fill's own colour and would
          leave the bar with no visible track. aria-label: Radix gives the
          root no accessible name of its own, and this bar is the only place
          the fraction lives besides the text above it. */}
      <Progress
        value={progress.percent}
        className="bg-secondary mt-1.5"
        aria-label={copy.today.progressLabel}
      />
    </div>
  );
}
