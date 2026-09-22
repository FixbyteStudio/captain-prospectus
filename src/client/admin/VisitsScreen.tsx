import type { AdminVisit } from "../../shared/schemas";
import { OUTCOME_TO_STATUS } from "../../shared/constants";
import { OUTCOME_LABELS, copy } from "../copy";
import { formatDateTime } from "../format";
import { cn } from "../lib/utils";
import { STATUS_EDGE, STATUS_TEXT } from "./status";
import { useVisitsFeed } from "./queries";

/**
 * Visits as they arrive — ADR-0010, docs/design.md "The live feed".
 *
 * A ledger, not a wall of cards: the roadmap sketched this with shadcn `card`,
 * `badge` and `scroll-area`, and the design pass overruled all three. Cards
 * around rows and status as a coloured pill are both on design.md's "Not this"
 * list, and a pane with its own scrollbar inside a page that scrolls is two
 * scrollbars and a lost keyboard.
 *
 * Arrivals are ambient, never a toast. A visit that landed stays true, and the
 * admin who was making coffee should find it on the list rather than have
 * missed it (design.md, field principle 8 read on the admin side).
 */
export function VisitsScreen() {
  const { visits, arrived, isPending, isError } = useVisitsFeed();

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.visits.title}</h2>
        {visits.length > 0 && (
          <span className="text-muted-foreground tnum">{copy.visits.count(visits.length)}</span>
        )}
      </div>

      {/* The highlight is decoration; this is what a screen reader is told. */}
      <p role="status" aria-live="polite" className="sr-only">
        {arrived.length > 0 ? copy.visits.arrived(arrived.length) : ""}
      </p>

      {isError && <p className="text-destructive">{copy.visits.loadFailed}</p>}

      {!isError && visits.length === 0 && (
        <p className="text-muted-foreground">
          {isPending ? copy.visits.loading : copy.visits.empty}
        </p>
      )}

      {visits.length > 0 && (
        <ul className="border-border bg-card divide-border divide-y rounded-md border">
          {visits.map((visit) => (
            <VisitRow key={visit.id} visit={visit} isNew={arrived.includes(visit.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The leading edge is the outcome's *consequence*, not the outcome: the column
 * scans as "what does this leave me to do". The French label sits in its own
 * column, because colour never carries the information alone (design.md).
 */
function VisitRow({ visit, isNew }: { visit: AdminVisit; isNew: boolean }) {
  const status = OUTCOME_TO_STATUS[visit.outcome];

  return (
    <li
      className={cn(
        "px-3.5 py-2.5",
        STATUS_EDGE[status],
        // Motion only where something changed (principle 5). The reduced-motion
        // block in app.css drops the transition; the row still appears, and the
        // wash is never the only signal that it is new — the live region above
        // says so too.
        isNew && "bg-accent transition-colors duration-700",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Read down as a sequence, so time is left and tabular — unlike the
            prospect ledger, where numbers are quantities and sit right. */}
        <span className="text-muted-foreground tnum shrink-0">
          {formatDateTime(visit.receivedAt)}
        </span>
        <span className="min-w-0 flex-1 font-medium">{visit.prospectName}</span>
        <span className={cn("shrink-0", STATUS_TEXT[status])}>{OUTCOME_LABELS[visit.outcome]}</span>
        {visit.flyerGiven && (
          <span className="text-muted-foreground shrink-0 text-xs">{copy.visits.flyer}</span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">{visit.agentEmail}</span>
      </div>
      {visit.notes && <p className="text-muted-foreground mt-1 text-xs">« {visit.notes} »</p>}
    </li>
  );
}
