import type { ImportResult } from "../../../shared/schemas";
import { copy } from "../../copy";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";

/** What actually happened, in the app's own words: created, updated, rejected. */
export function ResultDialog({
  result,
  rejectedCount,
  onClose,
  onSeeProspects,
}: {
  result: ImportResult | null;
  rejectedCount: number;
  onClose: () => void;
  onSeeProspects: () => void;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{copy.import.result.title}</DialogTitle>
          <DialogDescription>
            {result && (
              <>
                {copy.import.result.created(result.created)}
                {" · "}
                {copy.import.result.updated(result.updated)}
                {rejectedCount > 0 && (
                  <>
                    {" · "}
                    {copy.import.result.skipped(rejectedCount)}
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {copy.import.actions.done}
          </Button>
          <Button onClick={onSeeProspects}>{copy.import.result.seeProspects}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
