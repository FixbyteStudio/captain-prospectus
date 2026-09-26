import type { ComponentType } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { copy } from "../../copy";
import { deltaTone, formatCount, formatDelta } from "../../format";
import { Badge } from "../../ui/badge";
import { Card } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** The shell both the card and its skeleton share, so loading never shifts the grid. */
const SHELL = "min-w-0 gap-1 p-4.5 pb-4";

/** Neutral when flat or "—": colour means a direction, and there is none. */
const TONE = {
  up: { variant: "tint-success", Arrow: ArrowUp },
  down: { variant: "tint-destructive", Arrow: ArrowDown },
  flat: { variant: "secondary", Arrow: null },
} as const;

/**
 * One KPI — docs/design.md › Tableau de bord: overline label and icon tile,
 * the figure, then the delta chip and "vs période précédente".
 *
 * `delta` left out means the figure is a snapshot (Prospects ouverts) and has
 * no delta row at all; `null` means there was no previous period, shown "—".
 * No coloured edge: on this app an edge means a status.
 */
export function KpiCard({
  label,
  icon: IconTile,
  value,
  delta,
}: {
  label: string;
  icon: Icon;
  value: number;
  delta?: number | null;
}) {
  return (
    <Card className={SHELL}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-overline text-muted-foreground uppercase">{label}</h3>
        <span className="bg-secondary grid size-8 shrink-0 place-items-center rounded-lg">
          <IconTile className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="text-display tnum">{formatCount(value)}</p>
      {delta === undefined ? (
        // Keeps the figure at the same height as its neighbours' (mockup).
        <div className="h-7" aria-hidden="true" />
      ) : (
        <DeltaRow delta={delta} />
      )}
    </Card>
  );
}

function DeltaRow({ delta }: { delta: number | null }) {
  const { variant, Arrow } = TONE[deltaTone(delta)];
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {/* No text-meta here: tailwind-merge reads an unknown text-* token as a
          colour and would drop the variant's text-success. The badge's own
          text-xs is the meta size already. */}
      <Badge variant={variant} className="tnum rounded-sm">
        {Arrow && <Arrow aria-hidden="true" />}
        {formatDelta(delta)}
      </Badge>
      <span className="text-meta text-muted-foreground">{copy.dashboard.vsPrevious}</span>
    </p>
  );
}

/** A KPI card's shape with no figures in it, while the first answer loads. */
export function KpiCardSkeleton() {
  return (
    <Card className={SHELL} aria-hidden="true">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="mt-1.5 h-5 w-40" />
    </Card>
  );
}
