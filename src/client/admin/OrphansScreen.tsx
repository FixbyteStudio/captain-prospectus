import { useState } from "react";
import { toast } from "sonner";
import type { OrphanCandidate, OrphanedVisit } from "../../shared/schemas";
import { OUTCOME_TO_STATUS } from "../../shared/constants";
import { OUTCOME_LABELS, copy } from "../copy";
import { formatDateTime } from "../format";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { STATUS_EDGE, STATUS_TEXT } from "./status";
import { useDiscardOrphan, useOrphans, useRepairOrphan } from "./queries";

/**
 * Visits the server took but could not place — ADR-0022, design.md "The repair
 * queue".
 *
 * One question per row: where does this visit belong? Everything else on the
 * row is evidence for answering it, which is why the actions are inline rather
 * than behind a dialog — a queue of five decisions should not be five journeys.
 *
 * The leading edge forecasts what repairing would do, using the same
 * STATUS_EDGE the live feed uses. That is the one thing here that could
 * mislead, because the outcome has *not* taken effect yet, so the lede carries
 * the correction once for every row rather than as a badge on each.
 */
export function OrphansScreen() {
  const { data, isPending, isError } = useOrphans();
  const [confirming, setConfirming] = useState<OrphanedVisit | null>(null);
  const discard = useDiscardOrphan();

  const visits = data?.visits ?? [];

  function confirmDiscard() {
    if (!confirming) return;
    discard.mutate(confirming.id, {
      onSuccess: () => toast.success(copy.orphans.discarded),
      onError: () => toast.error(copy.orphans.discardFailed),
      onSettled: () => setConfirming(null),
    });
  }

  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.orphans.title}</h2>
        {visits.length > 0 && (
          <span className="text-muted-foreground tnum">{copy.orphans.count(visits.length)}</span>
        )}
      </div>
      <p className="text-muted-foreground mb-4 text-sm">{copy.orphans.lede}</p>

      {isError && <p className="text-destructive">{copy.orphans.loadFailed}</p>}

      {!isError && (isPending || visits.length === 0) && (
        <p className="text-muted-foreground">
          {isPending ? copy.orphans.loading : copy.orphans.empty}
        </p>
      )}

      {visits.length > 0 && (
        <ul className="border-border bg-card divide-border divide-y rounded-md border">
          {visits.map((visit) => (
            <OrphanRow key={visit.id} visit={visit} onDiscard={() => setConfirming(visit)} />
          ))}
        </ul>
      )}

      {/* Non-zero means something upstream is wrong, not that the page is small. */}
      {data && data.remaining > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          {copy.orphans.overflow(data.remaining)}
        </p>
      )}

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.orphans.confirm.title}</DialogTitle>
            <DialogDescription>{copy.orphans.confirm.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {copy.orphans.confirm.cancel}
            </Button>
            <Button variant="destructive" onClick={confirmDiscard} disabled={discard.isPending}>
              {copy.orphans.confirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OrphanRow({ visit, onDiscard }: { visit: OrphanedVisit; onDiscard: () => void }) {
  const repair = useRepairOrphan();
  const status = OUTCOME_TO_STATUS[visit.outcome];

  function attach(prospectId: string, name: string) {
    repair.mutate(
      { visitId: visit.id, prospectId },
      {
        onSuccess: () => toast.success(copy.orphans.attached(name)),
        onError: () => toast.error(copy.orphans.attachFailed),
      },
    );
  }

  // A not_assigned visit already names its prospect, so the ask is a nod rather
  // than a choice. An unknown_prospect one has to be pointed somewhere.
  const namesItsProspect = visit.reason === "not_assigned" && visit.prospectName !== null;

  return (
    <li className={cn("px-3.5 py-2.5", STATUS_EDGE[status])}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-muted-foreground tnum shrink-0">
          {formatDateTime(visit.visitedAt)}
        </span>
        <span className={cn("shrink-0", STATUS_TEXT[status])}>{OUTCOME_LABELS[visit.outcome]}</span>
        {visit.flyerGiven && (
          <span className="text-muted-foreground shrink-0 text-xs">{copy.orphans.flyer}</span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">{visit.agentEmail}</span>
        <span className="min-w-0 flex-1" />
        <span className="text-muted-foreground shrink-0 text-xs">
          {copy.orphans.reason[visit.reason]}
        </span>
      </div>

      {visit.notes && <p className="text-muted-foreground mt-1 text-xs">« {visit.notes} »</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {namesItsProspect && visit.prospectName ? (
          <Button
            size="sm"
            disabled={repair.isPending}
            onClick={() => attach(visit.prospectId, visit.prospectName ?? "")}
          >
            {copy.orphans.attachHere(visit.prospectName)}
          </Button>
        ) : visit.candidates.length > 0 ? (
          <>
            <span className="text-muted-foreground shrink-0 text-xs">{copy.orphans.attachTo}</span>
            {visit.candidates.map((candidate) => (
              <CandidateButton
                key={candidate.id}
                candidate={candidate}
                disabled={repair.isPending}
                onAttach={() => attach(candidate.id, candidate.name)}
              />
            ))}
          </>
        ) : (
          <p className="text-muted-foreground min-w-0 flex-1 text-xs">
            {copy.orphans.noCandidates}
          </p>
        )}

        {/* Right of the attach controls, and away from them: a misclick here
            cannot be undone. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={onDiscard}
          disabled={repair.isPending}
        >
          {copy.orphans.discard}
        </Button>
      </div>
    </li>
  );
}

/** Distance sits inside the target, because it is the reason to press it. */
function CandidateButton({
  candidate,
  disabled,
  onAttach,
}: {
  candidate: OrphanCandidate;
  disabled: boolean;
  onAttach: () => void;
}) {
  const distance = candidate.distanceM === null ? null : copy.orphans.metres(candidate.distanceM);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onAttach}
      aria-label={copy.orphans.attachAria(candidate.name, distance ?? "")}
    >
      {candidate.name}
      {distance && <span className="text-muted-foreground tnum ml-1.5 text-xs">· {distance}</span>}
    </Button>
  );
}
