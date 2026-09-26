import { useState } from "react";
import { BadgeCheck, MapPin, Percent, Store } from "lucide-react";
import {
  DASHBOARD_DEFAULT_PERIOD,
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "../../../shared/constants";
import { copy } from "../../copy";
import { formatCount, formatPercent, formatPoints } from "../../format";
import { cn } from "../../lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../../ui/alert";
import { Button } from "../../ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../ui/toggle-group";
import { useDashboard } from "../queries";
import { KpiCard, KpiCardSkeleton } from "./KpiCard";
import { VisitsChart, VisitsChartSkeleton } from "./VisitsChart";

function isPeriod(value: number): value is DashboardPeriod {
  return (DASHBOARD_PERIODS as readonly number[]).includes(value);
}

/**
 * Tableau de bord at `/admin` — GH #107, docs/design.md › Tableau de bord.
 *
 * Every figure comes from `GET /api/admin/dashboard`, which defines it; this
 * screen only lays the answer out. Later stories add cards and panels to the
 * same grid and the same response.
 */
export function DashboardScreen() {
  const [period, setPeriod] = useState<DashboardPeriod>(DASHBOARD_DEFAULT_PERIOD);
  const dashboard = useDashboard(period);
  const data = dashboard.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-title">{copy.dashboard.title}</h2>
          <p className="text-muted-foreground mt-0.5">{copy.dashboard.subtitle}</p>
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          value={String(period)}
          // Radix sends "" when the chosen item is pressed again; a period is
          // never unset, so that press does nothing.
          onValueChange={(value) => {
            const next = Number(value);
            if (value !== "" && isPeriod(next)) setPeriod(next);
          }}
          aria-label={copy.dashboard.periodLabel}
          className="bg-secondary rounded-lg p-0.5"
        >
          {DASHBOARD_PERIODS.map((p) => (
            <ToggleGroupItem
              key={p}
              value={String(p)}
              className="text-muted-foreground hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground rounded-md px-3 first:rounded-md last:rounded-md hover:bg-transparent data-[state=on]:shadow-sm"
            >
              {copy.dashboard.periods[p]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Outside the aria-busy grid, so it is announced rather than hidden. */}
      <p role="status" className="sr-only">
        {!data && !dashboard.isError ? copy.dashboard.loading : ""}
      </p>

      {dashboard.isError && (
        <Alert variant="destructive">
          <AlertTitle>{copy.dashboard.loadFailed}</AlertTitle>
          <AlertDescription>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={dashboard.isFetching}
              onClick={() => void dashboard.refetch()}
            >
              {copy.dashboard.retry}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* A failed refetch keeps its last figures (TanStack v5 keeps `data`
          on error), so the cards stay under the Alert. Skeletons only when
          there is nothing yet and nothing has failed. */}
      {(data || !dashboard.isError) && (
        <div
          aria-busy={dashboard.isFetching}
          className={cn(
            "grid gap-6 md:grid-cols-2 lg:grid-cols-4",
            // Another period's figures, kept while this one loads.
            dashboard.isPlaceholderData && "opacity-60",
          )}
        >
          {data ? (
            <>
              <KpiCard
                label={copy.dashboard.openProspects}
                icon={Store}
                value={formatCount(data.openProspects)}
              />
              <KpiCard
                label={copy.dashboard.visits}
                icon={MapPin}
                value={formatCount(data.visits.value)}
                delta={data.visits.delta}
              />
              <KpiCard
                label={copy.dashboard.converted}
                icon={BadgeCheck}
                value={formatCount(data.converted.value)}
                delta={data.converted.delta}
              />
              <KpiCard
                label={copy.dashboard.conversionRate}
                icon={Percent}
                value={formatPercent(data.conversionRate.value)}
                delta={data.conversionRate.delta}
                deltaFormat={formatPoints}
              />
            </>
          ) : (
            <>
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
              <KpiCardSkeleton />
            </>
          )}
        </div>
      )}

      {(data || !dashboard.isError) && (
        // 2:1 with Pipeline par statut at ≥ lg (story 8 fills the third).
        <div
          aria-busy={dashboard.isFetching}
          className={cn("grid gap-6 lg:grid-cols-3", dashboard.isPlaceholderData && "opacity-60")}
        >
          <div className="min-w-0 lg:col-span-2">
            {data ? <VisitsChart days={data.visitsByDay} /> : <VisitsChartSkeleton />}
          </div>
        </div>
      )}
    </section>
  );
}
