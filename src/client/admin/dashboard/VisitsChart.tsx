import { Bar, BarChart, CartesianGrid, XAxis, YAxis, type BarShapeProps } from "recharts";
import { OUTCOMES, type Outcome } from "../../../shared/constants";
import type { DashboardResponse } from "../../../shared/schemas";
import { OUTCOME_LABELS, copy } from "../../copy";
import { formatCount, formatDay, formatDayTick } from "../../format";
import { Card } from "../../ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "../../ui/chart";
import { Skeleton } from "../../ui/skeleton";
import { SERIES_INK, SERIES_TOKEN } from "./outcome-series";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";

type Day = DashboardResponse["visitsByDay"][number];

const config = Object.fromEntries(
  OUTCOMES.map((o) => [o, { label: OUTCOME_LABELS[o], color: `var(${SERIES_TOKEN[o]})` }]),
) satisfies ChartConfig;

/**
 * A count is printed in its segment only when it fits there: 22 px tall
 * (docs/design.md › Tableau de bord) and wide enough for its own digits, so a
 * narrow bar never spills a number over its neighbours (GH #110 decision).
 * The tooltip and the summary table carry every count either way.
 */
export const COUNT_MIN_HEIGHT = 22;
export const COUNT_MIN_WIDTH = 14;
/** A tabular digit at text-meta is ~7 px; 4 px keeps the text off the edges. */
const DIGIT_PX = 7;
export function showsCount(width: number, height: number, count: number): boolean {
  const digits = formatCount(count).length;
  return height >= COUNT_MIN_HEIGHT && width >= Math.max(COUNT_MIN_WIDTH, digits * DIGIT_PX + 4);
}

/**
 * Whether a segment takes the 1px card stroke on its top edge: it is drawn
 * and a later series in the stack (higher up) is too. The series are not 3:1
 * against each other, so this stroke is what tells neighbours apart
 * (WCAG 1.4.11, docs/design.md › Tableau de bord).
 */
export function hasNeighbourAbove(counts: Day["counts"], outcome: Outcome): boolean {
  if (counts[outcome] === 0) return false;
  return OUTCOMES.slice(OUTCOMES.indexOf(outcome) + 1).some((o) => counts[o] > 0);
}

/** Recharts' own stroke would outline all four sides; this draws only the shared edge. */
export function segment(outcome: Outcome) {
  return function Segment({ x, y, width, height, fill, payload }: BarShapeProps) {
    if (height <= 0) return null;
    const row = payload as Day["counts"];
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} />
        {hasNeighbourAbove(row, outcome) && (
          <line
            x1={x}
            x2={x + width}
            y1={y + 0.5}
            y2={y + 0.5}
            strokeWidth={1}
            className="stroke-card"
          />
        )}
        {showsCount(width, height, row[outcome]) && (
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className={`text-meta tnum font-semibold ${SERIES_INK[outcome].className}`}
          >
            {formatCount(row[outcome])}
          </text>
        )}
      </g>
    );
  };
}

const SHAPES = Object.fromEntries(OUTCOMES.map((o) => [o, segment(o)])) as Record<
  Outcome,
  ReturnType<typeof segment>
>;

/** The card's shell, shared with its skeleton so loading never shifts the grid. */
const SHELL = "min-w-0 gap-4 p-4.5";
const PLOT = "aspect-auto h-64 w-full";

/**
 * Visites dans le temps — docs/design.md › Tableau de bord, GH #110.
 *
 * A stacked bar per Brussels day, Personne sur place at the bottom through
 * Converti at the top, in the `OUTCOMES` order the endpoint and the legend
 * share. The legend has no click handler: a hidden series would make the day
 * totals lie (docs/design.md › Tableau de bord).
 */
export function VisitsChart({ days }: { days: Day[] }) {
  const weekday = days.length <= 7;
  const rows = days.map((d) => ({ date: d.date, ...d.counts }));

  return (
    <Card className={SHELL}>
      <h3 className="text-heading">{copy.dashboard.visitsChart.title}</h3>
      <ChartContainer config={config} className={PLOT}>
        <BarChart data={rows} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={12}
            tickFormatter={(date: string) => formatDayTick(date, weekday)}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={32}
            tickFormatter={(n: number) => formatCount(n)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-48"
                labelFormatter={(_label, payload) => {
                  const date: unknown = payload[0]?.payload?.date;
                  return typeof date === "string" ? formatDay(date) : null;
                }}
              />
            }
          />
          <ChartLegend
            verticalAlign="top"
            // Recharts lists stacked series top-down; the legend reads in the
            // stack's fixed order, Personne sur place first, as the mockup does.
            itemSorter={(item) => OUTCOMES.indexOf(item.dataKey as Outcome)}
            content={<ChartLegendContent className="flex-wrap justify-start gap-x-3 gap-y-1" />}
          />
          {OUTCOMES.map((o) => (
            <Bar
              key={o}
              dataKey={o}
              stackId="visits"
              fill={`var(--color-${o})`}
              shape={SHAPES[o]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <SummaryTable days={days} />
    </Card>
  );
}

/** The chart's text equivalent (docs/design.md › Tableau de bord). */
function SummaryTable({ days }: { days: Day[] }) {
  const t = copy.dashboard.visitsChart;
  return (
    <div className="sr-only">
      <Table>
        <TableCaption>{t.tableCaption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t.day}</TableHead>
            {OUTCOMES.map((o) => (
              <TableHead key={o} scope="col">
                {OUTCOME_LABELS[o]}
              </TableHead>
            ))}
            <TableHead scope="col">{t.total}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((d) => (
            <TableRow key={d.date}>
              <TableHead scope="row">{formatDay(d.date)}</TableHead>
              {OUTCOMES.map((o) => (
                <TableCell key={o}>{formatCount(d.counts[o])}</TableCell>
              ))}
              <TableCell>{formatCount(OUTCOMES.reduce((n, o) => n + d.counts[o], 0))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The chart card's shape with nothing in it, while the first answer loads. */
export function VisitsChartSkeleton() {
  return (
    <Card className={SHELL} aria-hidden="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className={PLOT} />
    </Card>
  );
}
