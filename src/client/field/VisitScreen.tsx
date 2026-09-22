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
 *
 * The form runs on react-hook-form (ADR-0018), but the rules do not live here:
 * the resolver calls `toVisit` from `visit-draft.ts`, the same pure function
 * the tests exercise. react-hook-form owns which control is marked and what is
 * announced; it owns no validation and, above all, no persistence.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { BackLink } from "./BackLink";
import { useLiveQuery } from "dexie-react-hooks";
import { buttonVariants } from "@/ui/button-variants";
import { FieldCheckbox, FieldRadioGroup, FieldRadioOption } from "@/ui/field-controls";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { apiFetch } from "../api";
import { copy, OUTCOME_LABELS, TYPE_LABELS } from "../copy";
import { cn } from "../lib/utils";
import { formatDate } from "../format";
import { OUTCOMES, type Outcome } from "../../shared/constants";
import { visitHistoryResponseSchema } from "../../shared/schemas";
import { cacheVisitHistory, fieldDb } from "./db";
import { emptyDraft, toVisit, withOutcome, type VisitDraft } from "./visit-draft";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

export function VisitScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncNow } = useSyncState();
  const { point } = useAgentPosition();

  /** The outbox write itself failed, so nothing is queued. */
  const [saveFailed, setSaveFailed] = useState(false);

  // The visit's id is minted once, not per validation attempt: it is the
  // idempotency key (INVARIANT 4), so re-validating must not mint a second one.
  const [visitId] = useState(() => crypto.randomUUID());

  /**
   * The resolver is `toVisit`, the pure function in `visit-draft.ts` — the one
   * the test suite drives directly. It already returns which control failed and
   * why; this only restates that as react-hook-form's error shape, so the two
   * can never disagree about whether a visit is valid.
   *
   * The context it needs is a placeholder: `save` builds the real visit with a
   * fresh clock reading and the position as it stands at that moment. Nothing
   * validated here is ever the row that gets queued.
   */
  const resolver = useMemo<Resolver<VisitDraft>>(
    () => (values) => {
      const result = toVisit(values, {
        id: visitId,
        prospectId: id ?? crypto.randomUUID(),
        visitedAt: Date.now(),
        position: point,
      });
      if (result.ok) return { values, errors: {} };

      const errors: Record<string, { type: string }> = {};
      for (const [field, type] of Object.entries(result.errors)) {
        if (type) errors[field] = { type };
      }
      return { values: {}, errors };
    },
    [id, point, visitId],
  );

  const form = useForm<VisitDraft>({ resolver, defaultValues: emptyDraft });
  /**
   * `useWatch`, not `form.watch()`: the latter returns a function the React
   * Compiler cannot memoize, so it bails out of compiling this component. Only
   * the outcome is watched, because it is the one value the markup branches on —
   * it decides whether the follow-up date exists at all.
   */
  const outcome = useWatch({ control: form.control, name: "outcome" });
  const errors = form.formState.errors;
  const saving = form.formState.isSubmitting;

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

  const save = useCallback(
    async (values: VisitDraft) => {
      if (!id) return;

      const result = toVisit(values, {
        id: visitId,
        prospectId: id,
        visitedAt: Date.now(),
        position: point,
      });

      // Unreachable: the resolver ran this same function on these same values.
      // Kept because `toVisit` returning a visit is what makes the write below
      // safe, and a silent `as` here would be exactly the wrong economy.
      if (!result.ok) return;

      setSaveFailed(false);

      // INVARIANT 3: the prospect's status is the server's to derive from this
      // visit. Nothing here touches the local copy — the new status arrives on
      // the next pull, in the list.
      try {
        await fieldDb.outboxVisits.add(result.visit);
      } catch {
        // Until this row exists, the outbox is not the only copy of the visit —
        // there is no copy at all (INVARIANT 5). A quota-exhausted or evicted
        // IndexedDB must therefore say so and leave the form standing, rather
        // than navigating away from a visit that was never queued.
        setSaveFailed(true);
        return;
      }

      void syncNow();
      await navigate("/tournee", { replace: true, state: { saved: true } });
    },
    [id, navigate, point, syncNow, visitId],
  );

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
    <Form {...form}>
      <form className="pb-24" onSubmit={(e) => void form.handleSubmit(save)(e)} noValidate>
        <header>
          <BackLink />
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.005em]">{name ?? ""}</h2>
          {type && <p className="text-muted-foreground text-sm">{TYPE_LABELS[type]}</p>}
        </header>

        <div className="border-border mt-6 border-t pt-4">
          <FormField
            control={form.control}
            name="flyerGiven"
            render={({ field }) => (
              <FieldCheckbox checked={field.value} onCheckedChange={field.onChange}>
                {copy.visit.flyerGiven}
              </FieldCheckbox>
            )}
          />
        </div>

        <div className="border-border mt-4 border-t pt-4">
          <p className="mb-3 font-medium">{copy.visit.outcome}</p>
          <FieldRadioGroup label={copy.visit.outcome} invalid={errors.outcome !== undefined}>
            {OUTCOMES.map((option) => (
              <FieldRadioOption
                key={option}
                name="outcome"
                value={option}
                checked={outcome === option}
                onSelect={(value) => {
                  // `withOutcome` drops a follow-up date the new outcome does
                  // not use — see its comment for what sending one would do.
                  const next = withOutcome(form.getValues(), value as Outcome);
                  form.setValue("outcome", next.outcome);
                  form.setValue("followUpDate", next.followUpDate);
                  // The date control may have just been unmounted; an error
                  // pinned to it would block saving with nothing on screen.
                  form.clearErrors(["outcome", "followUpDate"]);
                }}
              >
                {OUTCOME_LABELS[option]}
              </FieldRadioOption>
            ))}
          </FieldRadioGroup>
          {errors.outcome && (
            <p role="alert" className="text-destructive mt-1.5 text-sm">
              {copy.visit.outcomeRequired}
            </p>
          )}
        </div>

        {/* Only for the outcome that needs it, so the form stays as short as the
          decision allows (field-operations.md). */}
        {outcome === "follow_up" && (
          <FormField
            control={form.control}
            name="followUpDate"
            render={({ field }) => (
              <FormItem className="mt-4 gap-0">
                <FormLabel className="text-base font-medium">{copy.visit.followUpAt}</FormLabel>
                <FormControl>
                  <Input type="date" touch className="mt-1.5" {...field} />
                </FormControl>
                <FormMessage className="mt-1.5">
                  {errors.followUpDate?.type === "invalid"
                    ? copy.visit.followUpInvalid
                    : copy.visit.followUpRequired}
                </FormMessage>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="mt-4 gap-0">
              <FormLabel className="text-base font-medium">{copy.visit.notes}</FormLabel>
              <FormControl>
                <Textarea className="mt-1.5 text-base md:text-base" rows={3} {...field} />
              </FormControl>
              <FormMessage className="mt-1.5">{copy.visit.notesTooLong}</FormMessage>
            </FormItem>
          )}
        />

        <section className="border-border mt-8 border-t pt-4">
          <h3 className="text-muted-foreground text-sm font-medium">{copy.visit.previousVisits}</h3>
          {history.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">{copy.visit.noPreviousVisits}</p>
          ) : (
            <ul className="divide-border mt-2 divide-y">
              {history.map((entry) => (
                <li key={entry.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-muted-foreground text-sm">
                      {formatDate(entry.visitedAt)}
                    </span>
                    <span className="text-sm font-medium">{OUTCOME_LABELS[entry.outcome]}</span>
                  </div>
                  {/* What the last agent wrote is the reason this section exists
                    (field-operations.md): "ferme le lundi" is the difference
                    between a wasted walk and a kept appointment. */}
                  {entry.notes && (
                    <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
                      {entry.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sticky, because the outcome list is taller than a phone and the action
            should not require scrolling back past it. */}
        <div className="safe-bottom bg-background border-border fixed inset-x-0 bottom-0 border-t px-4 py-3">
          {saveFailed && (
            <p role="alert" className="text-destructive mb-2 text-sm">
              {copy.visit.saveFailed}
            </p>
          )}
          <button
            type="submit"
            className={cn(buttonVariants({ size: "touch" }), "w-full")}
            disabled={saving}
          >
            {saving ? copy.visit.saving : copy.visit.save}
          </button>
        </div>
      </form>
    </Form>
  );
}
