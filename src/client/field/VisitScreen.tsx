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
import { ScriptQuestions, questionDomId } from "./ScriptQuestions";
import { Input } from "@/ui/input";
import { Textarea } from "@/ui/textarea";
import { apiFetch } from "../api";
import { copy, OUTCOME_LABELS, TYPE_LABELS } from "../copy";
import { cn } from "../lib/utils";
import { formatDate } from "../format";
import { OUTCOMES, type Outcome } from "../../shared/constants";
import { visitHistoryResponseSchema } from "../../shared/schemas";
import { answerableQuestions } from "../../shared/answers";
import type { Answers, Script } from "../../shared/schemas";
import { cacheVisitHistory, fieldDb, getMeta } from "./db";
import { emptyDraft, toVisit, withOutcome, type VisitDraft } from "./visit-draft";
import { useAgentPosition } from "./useAgentPosition";
import { useRegisterDirty } from "./leave-guard";
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
   * The script as it stood when this form opened, read once and pinned.
   *
   * Not a live query on purpose: scripts.md says a visit records the version it
   * was answered with even if a newer one arrived before it synced, and a sync
   * landing mid-form must not swap the questions under the agent's thumb.
   * `undefined` means not read yet; `null` means none is cached.
   */
  const [script, setScript] = useState<Script | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getMeta(fieldDb, "script").then((cached) => {
      if (!cancelled) setScript(cached ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Only what this build can render; see `answers.ts` for why some are skipped. */
  const questions = useMemo(() => (script ? answerableQuestions(script.questions) : []), [script]);
  const hasQuestions = questions.length > 0;

  const [step, setStep] = useState<"outcome" | "questions">("outcome");

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
        script: script ?? null,
      });
      if (result.ok) return { values, errors: {} };

      const errors: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(result.errors)) {
        if (field === "answers" && value && typeof value === "object") {
          // Nested, so each question's control is marked on its own rather
          // than the whole step going red.
          errors.answers = Object.fromEntries(
            Object.entries(value).map(([key, type]) => [key, { type }]),
          );
        } else if (typeof value === "string") {
          errors[field] = { type: value };
        }
      }
      return { values: {}, errors };
    },
    [id, point, script, visitId],
  );

  const form = useForm<VisitDraft>({ resolver, defaultValues: emptyDraft });
  /**
   * `useWatch`, not `form.watch()`: the latter returns a function the React
   * Compiler cannot memoize, so it bails out of compiling this component. Only
   * the outcome is watched, because it is the one value the markup branches on —
   * it decides whether the follow-up date exists at all.
   */
  const outcome = useWatch({ control: form.control, name: "outcome" });
  const answers = useWatch({ control: form.control, name: "answers" });
  const errors = form.formState.errors;
  const saving = form.formState.isSubmitting;

  // A tab tap unmounts this form (#74, spec-gh-66): the leave guard asks
  // before it does, unless save() has already navigated it away itself.
  useRegisterDirty(form.formState.isDirty);

  /**
   * Step 1 does not save; it checks its own two controls and moves on. Doing
   * this with `trigger` rather than a submit keeps the questions' requiredness
   * out of it — they belong to the screen after this one.
   */
  const goToQuestions = useCallback(async () => {
    const ok = await form.trigger(["outcome", "followUpDate"]);
    if (ok) setStep("questions");
  }, [form]);

  /**
   * design.md: a blocked save moves the screen to the problem. With a variable
   * number of questions the first bad answer is easily below the fold, and a
   * button that appears to do nothing is how a form gets abandoned outdoors.
   */
  const showFirstProblem = useCallback(() => {
    const invalid = form.formState.errors;
    if (invalid.outcome || invalid.followUpDate) {
      setStep("outcome");
      return;
    }
    const answerErrorKeys = Object.keys(
      (invalid.answers as Record<string, unknown> | undefined) ?? {},
    );
    const firstKey = questions.find((question) => answerErrorKeys.includes(question.key))?.key;
    if (!firstKey) return;

    const element = document.getElementById(questionDomId(firstKey));
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
    element?.focus({ preventScroll: true });
  }, [form, questions]);

  /** Per-question errors, flattened back to the shape `ScriptQuestions` reads. */
  const answerErrors = useMemo(() => {
    const raw = errors.answers as Record<string, { type?: string }> | undefined;
    if (!raw) return undefined;
    const flat: Record<string, "required" | "invalid"> = {};
    for (const [key, error] of Object.entries(raw)) {
      flat[key] = error?.type === "invalid" ? "invalid" : "required";
    }
    return flat;
  }, [errors.answers]);

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
      <form
        className="pb-action-bar"
        onSubmit={(e) => void form.handleSubmit(save, showFirstProblem)(e)}
        noValidate
      >
        <header>
          {step === "outcome" ? (
            <BackLink />
          ) : (
            /* Back to step 1 with the draft intact — leaving the visit is one
               step further out, never a single stray tap (design.md). */
            <button
              type="button"
              className="text-muted-foreground -ml-1 inline-flex min-h-touch items-center gap-1 px-1 text-sm"
              onClick={() => setStep("outcome")}
            >
              <span aria-hidden>←</span> {copy.visit.backToOutcome}
            </button>
          )}
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.005em]">{name ?? ""}</h2>
          {type && <p className="text-muted-foreground text-sm">{TYPE_LABELS[type]}</p>}
        </header>

        {step === "outcome" && (
          <>
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
          </>
        )}

        {step === "questions" && (
          <>
            <div className="border-border mt-6 border-t pt-4">
              <h3 className="font-medium">{copy.visit.questions}</h3>
              {outcome === "no_contact" && (
                <p className="text-muted-foreground mt-1 text-sm">{copy.visit.questionsOptional}</p>
              )}
              <div className="mt-4">
                <ScriptQuestions
                  questions={questions}
                  answers={answers ?? {}}
                  errors={answerErrors}
                  onChange={(next: Answers) =>
                    form.setValue("answers", next, { shouldValidate: false })
                  }
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="mt-6 gap-0">
                  <FormLabel className="text-base font-medium">{copy.visit.notes}</FormLabel>
                  <FormControl>
                    <Textarea className="mt-1.5 text-base md:text-base" rows={3} {...field} />
                  </FormControl>
                  <FormMessage className="mt-1.5">{copy.visit.notesTooLong}</FormMessage>
                </FormItem>
              )}
            />
          </>
        )}

        {step === "outcome" && (
          <section className="border-border mt-8 border-t pt-4">
            <h3 className="text-muted-foreground text-sm font-medium">
              {copy.visit.previousVisits}
            </h3>
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
        )}

        {/* Sticky, because the outcome list is taller than a phone and the action
            should not require scrolling back past it. `.above-tab-bar` sits
            it directly above the tab bar below 768px rather than under it
            (app.css); at that size the tab bar itself owns the safe-area
            inset, so this carries only its own breathing room. */}
        <div className="above-tab-bar bg-background border-border fixed inset-x-0 border-t px-4 pt-3">
          {saveFailed && (
            <p role="alert" className="text-destructive mb-2 text-sm">
              {copy.visit.saveFailed}
            </p>
          )}
          {/* An action keeps its name through the flow, so « Enregistrer la
              visite » appears only on the screen that actually saves. */}
          {step === "outcome" && hasQuestions ? (
            /* `key` is load-bearing: without it React reconciles both branches
               to the same <button> node, and a node that has been type="submit"
               on step 2 keeps submitting when step 1 renders it as
               type="button" again — tapping « Continuer » saved the visit. */
            <button
              key="continue"
              type="button"
              className={cn(buttonVariants({ size: "touch" }), "w-full")}
              onClick={() => void goToQuestions()}
            >
              {copy.visit.continue}
            </button>
          ) : (
            <button
              key="save"
              type="submit"
              className={cn(buttonVariants({ size: "touch" }), "w-full")}
              disabled={saving}
            >
              {saving ? copy.visit.saving : copy.visit.save}
            </button>
          )}
        </div>
      </form>
    </Form>
  );
}
