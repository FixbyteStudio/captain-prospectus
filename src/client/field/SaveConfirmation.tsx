/**
 * The save confirmation — DESIGN.md › Bottom sheet / dialog, EXPERIENCE.md ›
 * Save sheet, docs/design.md, "Saving asks once".
 *
 * A bottom Sheet on a phone and a centred Dialog from 768px. They are two
 * components picked in JS, not one restyled with `md:`, because DESIGN.md names
 * both and each keeps its own motion; both wrap `radix-ui/dialog`, so the
 * choice costs no bytes.
 *
 * This only shows the draft and reports the agent's answer. It never writes:
 * "Enregistrer" is `VisitScreen`'s `save`, the one queueing path (#119).
 */
import type { ReactNode, RefObject } from "react";
import { CheckIcon, CloudUploadIcon, PencilIcon } from "lucide-react";
import { Badge } from "@/ui/badge";
import { buttonVariants } from "@/ui/button-variants";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { copy, OUTCOME_LABELS } from "../copy";
import { cn } from "../lib/utils";
import type { Outcome } from "../../shared/constants";

export type SaveSummary = {
  name: string;
  outcome: Outcome;
  flyerGiven: boolean;
  /** `null` when the visit has no questions: the row is absent, not "0". */
  answerCount: number | null;
  notes: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: SaveSummary | null;
  saving: boolean;
  saveFailed: boolean;
  onConfirm: () => void;
  /**
   * Where focus goes when it closes. Radix sends it to the dialog's Trigger,
   * and this one has none — it is opened by a validated submit — so without
   * this a keyboard or screen-reader user lands on `<body>` after Modifier.
   */
  returnFocusTo: RefObject<HTMLElement | null>;
};

export function SaveConfirmation({
  open,
  onOpenChange,
  summary,
  saving,
  saveFailed,
  onConfirm,
  returnFocusTo,
}: Props) {
  const isMobile = useIsMobile();

  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault();
    returnFocusTo.current?.focus();
  };

  // Closing mid-write would leave the agent on a form whose visit is being
  // queued underneath them; the write is milliseconds, so just wait for it.
  const onChange = (next: boolean) => {
    if (!saving) onOpenChange(next);
  };

  const body = summary && (
    <Body
      summary={summary}
      stacked={isMobile}
      saving={saving}
      saveFailed={saveFailed}
      onConfirm={onConfirm}
      onEdit={() => onChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          onCloseAutoFocus={onCloseAutoFocus}
          className="bg-card pb-page max-h-[90dvh] gap-0 overflow-y-auto rounded-t-xl px-4 pt-2.5"
        >
          {/* Decorative: the sheet is dismissed by Modifier or the scrim, not dragged. */}
          <div aria-hidden className="bg-border mx-auto mb-3.5 h-1 w-9 rounded-full" />
          <Header Title={SheetTitle} />
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="bg-card max-h-[90dvh] gap-0 overflow-y-auto rounded-xl"
      >
        <Header Title={DialogTitle} />
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Header({ Title }: { Title: typeof SheetTitle | typeof DialogTitle }) {
  return (
    <>
      <p className="text-overline text-muted-foreground uppercase">{copy.visit.confirm.overline}</p>
      <Title className="mt-0.5 mb-3 text-xl font-semibold">{copy.visit.confirm.title}</Title>
    </>
  );
}

function Body({
  summary,
  stacked,
  saving,
  saveFailed,
  onConfirm,
  onEdit,
}: {
  summary: SaveSummary;
  stacked: boolean;
  saving: boolean;
  saveFailed: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}) {
  const Description = stacked ? SheetDescription : DialogDescription;
  return (
    <>
      <dl className="bg-secondary divide-border divide-y rounded-lg px-3.5 py-1 text-base">
        <Row label={copy.visit.confirm.place}>
          <span className="font-semibold break-words">{summary.name}</span>
        </Row>
        <Row label={copy.visit.outcome}>
          {/* Neutral on purpose (INVARIANT 3): the outcome is named, never
              coloured like the status the server will derive from it. */}
          <Badge variant="secondary" className="bg-card text-sm">
            {OUTCOME_LABELS[summary.outcome]}
          </Badge>
        </Row>
        {summary.flyerGiven && (
          <Row label={copy.visit.confirm.flyer}>
            <Badge variant="secondary" className="bg-card text-sm">
              <CheckIcon aria-hidden />
              {copy.visit.flyerGiven}
            </Badge>
          </Row>
        )}
        {summary.answerCount !== null && (
          <Row label={copy.visit.questions}>
            <span className="tabular-nums">{copy.visit.confirm.answers(summary.answerCount)}</span>
          </Row>
        )}
        {summary.notes !== "" && (
          <div className="py-2.5">
            <dt className="text-muted-foreground">{copy.visit.notes}</dt>
            <dd className="mt-1 break-words whitespace-pre-line italic">{summary.notes}</dd>
          </div>
        )}
      </dl>

      <Description className="text-muted-foreground my-3 flex items-center gap-2 text-sm">
        <CloudUploadIcon aria-hidden className="size-4 shrink-0" />
        {copy.visit.confirm.reassurance}
      </Description>

      {saveFailed && (
        <p role="alert" className="text-destructive mb-3 text-base">
          {copy.visit.saveFailed}
        </p>
      )}

      {/* Enregistrer first in the DOM, so it is also first for the keyboard;
          on a dialog it is drawn on the right, where a confirm sits. */}
      <div className={cn("flex gap-2", stacked ? "flex-col" : "flex-row-reverse")}>
        <button
          type="button"
          className={cn(buttonVariants({ size: "touch" }), "flex-1")}
          disabled={saving}
          onClick={onConfirm}
        >
          {saving ? copy.visit.saving : copy.visit.confirm.save}
        </button>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "secondary", size: "touch" }), "flex-1")}
          disabled={saving}
          onClick={onEdit}
        >
          <PencilIcon aria-hidden />
          {copy.visit.confirm.edit}
        </button>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
