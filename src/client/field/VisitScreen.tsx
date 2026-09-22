/**
 * Logging a visit — docs/domains/field-operations.md, docs/design.md.
 *
 * The outcome list takes an unreasonable share of the screen on purpose: it is
 * the one thing the whole app exists to capture, and it has to be hittable by a
 * thumb without the agent looking carefully.
 *
 * Saving writes to the Dexie outbox and asks for a sync. It does not wait for
 * one — INVARIANT 5 keeps the row until the server lists it in `accepted`, so
 * an agent with no signal is finished the moment they tap save.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink } from "./BackLink";
import { useLiveQuery } from "dexie-react-hooks";
import { buttonVariants } from "@/ui/button-variants";
import { FieldCheckbox, FieldRadioGroup, FieldRadioOption } from "@/ui/field-controls";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { apiFetch } from "../api";
import { copy, OUTCOME_LABELS, TYPE_LABELS } from "../copy";
import { cn } from "../lib/utils";
import { formatDate } from "../format";
import { OUTCOMES, type Outcome } from "../../shared/constants";
import { visitHistoryResponseSchema } from "../../shared/schemas";
import { cacheVisitHistory, fieldDb } from "./db";
import { emptyDraft, toVisit, type DraftErrorField, type VisitDraft } from "./visit-draft";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

function FieldError({ children }: { children: string }) {
  return (
    <p role="alert" className="text-destructive mt-1.5 text-sm">
      {children}
    </p>
  );
}

export function VisitScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncNow } = useSyncState();
  const { point } = useAgentPosition();

  const [draft, setDraft] = useState<VisitDraft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<DraftErrorField, true>>>({});
  const [saving, setSaving] = useState(false);

  // The visit's id is minted once, not per validation attempt: it is the
  // idempotency key (INVARIANT 4), so re-validating must not mint a second one.
  const [visitId] = useState(() => crypto.randomUUID());

  const prospect = useLiveQuery(
    async () => (id ? ((await fieldDb.prospects.get(id)) ?? null) : null),
    [id],
    undefined,
  );
  const pendingProspect = useLiveQuery(
    async () => (id ? ((await fieldDb.outboxProspects.get(id)) ?? null) : null),
    [id],
    undefined,
  );
  const history = useLiveQuery(
    async () =>
      id
        ? await fieldDb.visitHistory.where("prospectId").equals(id).reverse().sortBy("visitedAt")
        : [],
    [id],
    [],
  );

  // Refresh the cached history when there is a network. Offline this is a
  // no-op and the screen shows whatever the last pull left behind.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    // `id` is a decoded router param; encode it back into the path segment so
    // a value containing `/`, `?` or `#` cannot change which route this hits.
    // In practice `prospectIdParamSchema` on the Worker rejects anything that
    // is not a UUID with a 400, but the path should not depend on that.
    void apiFetch<unknown>(`/api/agent/prospects/${encodeURIComponent(id)}/visits`)
      .then((body) => {
        if (cancelled) return;
        const parsed = visitHistoryResponseSchema.safeParse(body);
        if (parsed.success) return cacheVisitHistory(fieldDb, id, parsed.data.visits);
      })
      .catch(() => {
        // Offline, or the prospect is not on the server yet. Both are normal
        // here and neither is worth a message: the cache already answers.
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = useCallback(async () => {
    if (!id || saving) return;

    const result = toVisit(draft, {
      id: visitId,
      prospectId: id,
      visitedAt: Date.now(),
      position: point,
    });

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    setErrors({});
    // INVARIANT 3: the prospect's status is the server's to derive from this
    // visit. Nothing here touches the local copy — the new status arrives on
    // the next pull, in the list.
    await fieldDb.outboxVisits.add(result.visit);
    void syncNow();
    await navigate("/tournee", { replace: true, state: { saved: true } });
  }, [draft, id, navigate, point, saving, syncNow, visitId]);

  const name = prospect?.name ?? pendingProspect?.name;
  const type = prospect?.type ?? pendingProspect?.type;

  // useLiveQuery returns undefined until its first read resolves; null means
  // "looked and found nothing". Only the latter is a missing prospect.
  const settled = prospect !== undefined && pendingProspect !== undefined;
  if (settled && !name) {
    return (
      <section>
        <p className="text-muted-foreground">{copy.errors.notFound}</p>
        <Link
          to="/tournee"
          className={cn(buttonVariants({ variant: "outline", size: "touch" }), "mt-4")}
        >
          {copy.visit.back}
        </Link>
      </section>
    );
  }

  return (
    <section className="pb-24">
      <header>
        <BackLink />
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.005em]">{name ?? ""}</h2>
        {type && <p className="text-muted-foreground text-sm">{TYPE_LABELS[type]}</p>}
      </header>

      <div className="border-border mt-6 border-t pt-4">
        <FieldCheckbox
          checked={draft.flyerGiven}
          onCheckedChange={(flyerGiven) => setDraft((d) => ({ ...d, flyerGiven }))}
        >
          {copy.visit.flyerGiven}
        </FieldCheckbox>
      </div>

      <div className="border-border mt-4 border-t pt-4">
        <p className="mb-3 font-medium">{copy.visit.outcome}</p>
        <FieldRadioGroup label={copy.visit.outcome} invalid={errors.outcome}>
          {OUTCOMES.map((outcome) => (
            <FieldRadioOption
              key={outcome}
              name="outcome"
              value={outcome}
              checked={draft.outcome === outcome}
              onSelect={(value) => setDraft((d) => ({ ...d, outcome: value as Outcome }))}
            >
              {OUTCOME_LABELS[outcome]}
            </FieldRadioOption>
          ))}
        </FieldRadioGroup>
        {errors.outcome && <FieldError>{copy.visit.outcomeRequired}</FieldError>}
      </div>

      {/* Only for the outcome that needs it, so the form stays as short as the
          decision allows (field-operations.md). */}
      {draft.outcome === "follow_up" && (
        <div className="mt-4">
          <label htmlFor="followUpAt" className="text-base font-medium">
            {copy.visit.followUpAt}
          </label>
          <Input
            id="followUpAt"
            type="date"
            touch
            className="mt-1.5"
            value={draft.followUpDate}
            aria-invalid={errors.followUpDate ? true : undefined}
            onChange={(e) => setDraft((d) => ({ ...d, followUpDate: e.target.value }))}
          />
          {errors.followUpDate && <FieldError>{copy.visit.followUpRequired}</FieldError>}
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="notes" className="text-base font-medium">
          {copy.visit.notes}
        </label>
        <Textarea
          id="notes"
          className="mt-1.5 text-base md:text-base"
          rows={3}
          value={draft.notes}
          aria-invalid={errors.notes ? true : undefined}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
        {errors.notes && <FieldError>{copy.visit.notesTooLong}</FieldError>}
      </div>

      <section className="border-border mt-8 border-t pt-4">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.visit.previousVisits}</h3>
        {history.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">{copy.visit.noPreviousVisits}</p>
        ) : (
          <ul className="divide-border mt-2 divide-y">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="text-muted-foreground text-sm">{formatDate(entry.visitedAt)}</span>
                <span className="text-sm font-medium">{OUTCOME_LABELS[entry.outcome]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sticky, because the outcome list is taller than a phone and the action
          should not require scrolling back past it. */}
      <div className="safe-bottom bg-background border-border fixed inset-x-0 bottom-0 border-t px-4 py-3">
        <button
          type="button"
          className={cn(buttonVariants({ size: "touch" }), "w-full")}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? copy.visit.saving : copy.visit.save}
        </button>
      </div>
    </section>
  );
}
