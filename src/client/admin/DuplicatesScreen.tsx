import { toast } from "sonner";
import type { DuplicatePair, Prospect } from "../../shared/schemas";
import { STATUS_LABELS, copy } from "../copy";
import { formatDistance } from "../format";
import { cn } from "../lib/utils";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { STATUS_EDGE, STATUS_TEXT } from "./status";
import { useDuplicates, useMerge } from "./queries";

/**
 * Candidate duplicates, for a person to judge — docs/domains/prospecting.md.
 *
 * The machine cannot tell a rename from a takeover, so it only ever proposes.
 * Each side shows what it carries — status, assignee, how many visits — so the
 * admin is choosing between two known things rather than guessing which one it
 * would be safe to lose.
 */
export function DuplicatesScreen() {
  const duplicates = useDuplicates();
  const merge = useMerge();

  function keep(survivor: Prospect, merged: Prospect) {
    merge.mutate(
      { survivorId: survivor.id, mergedId: merged.id },
      {
        // The response's dedupeKeyUpdated flag conflates "the key was already
        // right" with "the new key was taken", so it is not something to
        // report. A key that is still contested reappears in the next sweep.
        onSuccess: () => toast.success(copy.duplicates.merged(survivor.name)),
        onError: () => toast.error(copy.duplicates.mergeFailed),
      },
    );
  }

  if (duplicates.isError) {
    return <p className="text-destructive">{copy.duplicates.loadFailed}</p>;
  }

  const pairs = duplicates.data?.pairs ?? [];

  return (
    <section>
      <div className="mb-1 flex items-baseline gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.duplicates.title}</h2>
        {pairs.length > 0 && (
          <span className="text-muted-foreground tnum ml-auto">
            {copy.duplicates.count(pairs.length)}
          </span>
        )}
      </div>
      <p className="text-muted-foreground mb-5 max-w-prose">{copy.duplicates.lede}</p>

      {duplicates.isPending && (
        <p className="text-muted-foreground" aria-busy="true">
          {copy.duplicates.loading}
        </p>
      )}

      {!duplicates.isPending && pairs.length === 0 && (
        <p className="text-muted-foreground">{copy.duplicates.empty}</p>
      )}

      {pairs.length > 0 && (
        <>
          <div className="border-border bg-card overflow-hidden rounded-md border">
            <Table className="[&_td]:h-row [&_td]:py-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-full min-w-48 pl-3.5">
                    {copy.duplicates.columns.name}
                  </TableHead>
                  <TableHead>{copy.duplicates.columns.status}</TableHead>
                  <TableHead>{copy.duplicates.columns.agent}</TableHead>
                  <TableHead className="text-right">{copy.duplicates.columns.visits}</TableHead>
                  <TableHead className="text-right">{copy.duplicates.columns.distance}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.map((pair) => (
                  <Pair
                    key={`${pair.a.id}|${pair.b.id}`}
                    pair={pair}
                    disabled={merge.isPending}
                    onKeep={keep}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          {duplicates.data?.truncated && (
            <Alert className="mt-4 max-w-2xl">
              <AlertDescription>{copy.duplicates.truncated}</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </section>
  );
}

function Pair({
  pair,
  disabled,
  onKeep,
}: {
  pair: DuplicatePair;
  disabled: boolean;
  onKeep: (survivor: Prospect, merged: Prospect) => void;
}) {
  const distance =
    pair.distanceM === null ? copy.duplicates.distanceUnknown : formatDistance(pair.distanceM);

  return (
    <>
      <Side
        prospect={pair.a}
        visits={pair.aVisits}
        distance={distance}
        first
        disabled={disabled}
        onKeep={() => onKeep(pair.a, pair.b)}
      />
      <Side
        prospect={pair.b}
        visits={pair.bVisits}
        distance={null}
        first={false}
        disabled={disabled}
        onKeep={() => onKeep(pair.b, pair.a)}
      />
    </>
  );
}

function Side({
  prospect,
  visits,
  distance,
  first,
  disabled,
  onKeep,
}: {
  prospect: Prospect;
  visits: number;
  distance: string | null;
  first: boolean;
  disabled: boolean;
  onKeep: () => void;
}) {
  return (
    // A pair reads as one thing: only the second row carries a bottom rule, so
    // the two sit together and the gap falls between pairs, not inside them.
    <TableRow className={cn(first && "border-b-0")}>
      <TableCell className={cn("pl-3.5 font-medium", STATUS_EDGE[prospect.status])}>
        {prospect.name}
        {prospect.address && (
          <span className="text-muted-foreground font-normal"> · {prospect.address}</span>
        )}
      </TableCell>
      <TableCell className={cn("whitespace-nowrap", STATUS_TEXT[prospect.status])}>
        {STATUS_LABELS[prospect.status]}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {prospect.assignedTo ?? <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="tnum text-right">
        {visits > 0 ? (
          <strong className="font-semibold">{visits}</strong>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      {distance !== null && (
        <TableCell
          rowSpan={2}
          className="text-muted-foreground tnum border-border border-l text-right align-middle whitespace-nowrap"
        >
          {distance}
        </TableCell>
      )}
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-label={copy.duplicates.keepAria(prospect.name)}
          onClick={onKeep}
        >
          {copy.duplicates.keep}
        </Button>
      </TableCell>
    </TableRow>
  );
}
