/**
 * The script editor — docs/design.md#the-script-editor, docs/domains/scripts.md.
 *
 * Saving is never an edit: it writes version N+1 of this script's name and
 * activates it, and every older version stays for the visits already
 * answered against it (INVARIANT 3 territory once agents answer these —
 * that is the next PR). The confirmation dialog exists so that is
 * unmistakable before it happens.
 */
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { PlusIcon } from "lucide-react";
import { copy } from "../../copy";
import { ApiError } from "../../api";
import { formatDateTime } from "../../format";
import { scriptCreateSchema } from "../../../shared/schemas";
import { useCreateScript, useScripts } from "../queries";
import {
  addQuestion,
  draftFromScript,
  draftToCreate,
  findDraftIssues,
  moveQuestion,
  nextVersionFor,
  removeQuestion,
  type DraftIssue,
  type ScriptDraft,
} from "./script-draft";
import { QuestionRow } from "./QuestionRow";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return copy.scripts.editor.saveFailed;
}

export function ScriptsScreen() {
  const scriptsQuery = useScripts();
  const createScript = useCreateScript();

  const scripts = scriptsQuery.data?.scripts ?? [];
  // A `find` over at most SCRIPTS_PAGE_SIZE rows is cheap enough to redo every
  // render — no need to memoize it against a `scripts` reference that is a
  // fresh `[]` literal on every render before the query settles anyway.
  const active = scripts.find((s) => s.isActive) ?? null;

  const form = useForm<ScriptDraft>({ defaultValues: draftFromScript(null) });
  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "questions",
    keyName: "rowId",
  });

  // Seeded once the active script is known, and again after a save — never on
  // every background refetch, or an admin's in-progress edit would vanish
  // under them.
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && scriptsQuery.isSuccess) {
      form.reset(draftFromScript(active));
      seeded.current = true;
    }
  }, [scriptsQuery.isSuccess, active, form]);

  const name = useWatch({ control: form.control, name: "name" }) ?? "";
  const questions = useWatch({ control: form.control, name: "questions" }) ?? [];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<ScriptDraft | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active: activeItem, over } = event;
    if (!over || activeItem.id === over.id) return;
    const from = questions.findIndex((q) => q.id === activeItem.id);
    const to = questions.findIndex((q) => q.id === over.id);
    if (from === -1 || to === -1) return;
    replace(moveQuestion(questions, from, to));
  }

  function applyIssues(issues: DraftIssue[]) {
    for (const issue of issues) {
      switch (issue.kind) {
        case "empty_name":
          form.setError("name", { type: "required" });
          break;
        case "no_questions":
          form.setError("questions", { type: "required" });
          break;
        case "empty_label": {
          const index = questions.findIndex((q) => q.id === issue.questionId);
          if (index !== -1) form.setError(`questions.${index}.label`, { type: "required" });
          break;
        }
        case "invalid_key": {
          const index = questions.findIndex((q) => q.id === issue.questionId);
          if (index !== -1) form.setError(`questions.${index}.key`, { type: "invalid" });
          break;
        }
        case "duplicate_key": {
          const index = questions.findIndex((q) => q.id === issue.questionId);
          if (index !== -1) form.setError(`questions.${index}.key`, { type: "duplicate" });
          break;
        }
        case "missing_options": {
          const index = questions.findIndex((q) => q.id === issue.questionId);
          if (index !== -1) form.setError(`questions.${index}.options`, { type: "required" });
          break;
        }
      }
    }
  }

  function openConfirm(values: ScriptDraft) {
    form.clearErrors();
    const issues = findDraftIssues(values);
    if (issues.length > 0) {
      applyIssues(issues);
      // "empty_name" and "no_questions" have no row to point at, so the
      // per-field FormMessage below a question cannot carry them — a toast
      // is the only way the admin learns why nothing happened.
      if (issues.some((i) => i.kind === "empty_name"))
        toast.error(copy.scripts.errors.nameRequired);
      if (issues.some((i) => i.kind === "no_questions"))
        toast.error(copy.scripts.errors.noQuestions);
      return;
    }
    setPending(values);
    setConfirmOpen(true);
  }

  function confirmSave() {
    if (!pending) return;
    const payload = draftToCreate(pending);
    const parsed = scriptCreateSchema.safeParse(payload);
    if (!parsed.success) {
      // The draft passed findDraftIssues, so this is not a shape the admin
      // caused — nothing left for them to fix by hand.
      setConfirmOpen(false);
      toast.error(copy.scripts.editor.saveFailed);
      return;
    }
    createScript.mutate(parsed.data, {
      onSuccess: (script) => {
        toast.success(copy.scripts.editor.saved(script.version));
        form.reset(draftFromScript(script));
        setConfirmOpen(false);
        setPending(null);
      },
      onError: (error) => {
        toast.error(failureMessage(error));
        setConfirmOpen(false);
      },
    });
  }

  if (scriptsQuery.isError) {
    return <p className="text-destructive">{copy.scripts.loadFailed}</p>;
  }

  if (scriptsQuery.isPending) {
    return (
      <p className="text-muted-foreground" aria-busy="true">
        {copy.scripts.loading}
      </p>
    );
  }

  const nextVersion = nextVersionFor(scripts, name);

  return (
    <section>
      <header>
        <h2 className="text-xl font-semibold tracking-[-0.005em]">{copy.scripts.title}</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{copy.scripts.lede}</p>
      </header>

      <Form {...form}>
        <form
          className="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]"
          onSubmit={(e) => void form.handleSubmit(openConfirm)(e)}
          noValidate
        >
          <div>
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FormItem className="max-w-sm gap-1.5">
                  <FormLabel>{copy.scripts.name}</FormLabel>
                  <FormControl>
                    <Input placeholder={copy.scripts.namePlaceholder} {...field} />
                  </FormControl>
                  <FormMessage>
                    {fieldState.error ? copy.scripts.errors.nameRequired : undefined}
                  </FormMessage>
                </FormItem>
              )}
            />

            <div className="mt-6 flex items-center justify-between">
              <h3 className="font-medium">{copy.scripts.question.sectionTitle}</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => replace(addQuestion(questions))}
              >
                <PlusIcon /> {copy.scripts.question.add}
              </Button>
            </div>

            <ul className="border-border bg-card mt-3 overflow-hidden rounded-md border">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={questions.map((q) => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {fields.map((field, index) => (
                    // Keyed by our own stable id, not RHF's `rowId`: `replace()`
                    // regenerates `rowId` for every row on every call, and
                    // keying on it would remount the whole list — including
                    // mid-drag — on every reorder, add or remove.
                    <QuestionRow
                      key={field.id}
                      form={form}
                      index={index}
                      id={field.id}
                      otherKeys={questions.filter((_, i) => i !== index).map((q) => q.key)}
                      onRemove={() => replace(removeQuestion(questions, field.id))}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {fields.length === 0 && (
                <li className="text-muted-foreground px-3.5 py-8 text-sm">
                  {copy.scripts.question.empty}
                </li>
              )}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <p className="text-muted-foreground text-sm">{copy.scripts.editor.saveWarning}</p>
              <Button type="submit" disabled={createScript.isPending}>
                {createScript.isPending ? copy.scripts.editor.saving : copy.scripts.editor.save}
              </Button>
            </div>
          </div>

          <aside>
            <h3 className="font-medium">{copy.scripts.history.title}</h3>
            {scripts.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">{copy.scripts.history.empty}</p>
            ) : (
              <ul className="border-border bg-card divide-border mt-3 divide-y overflow-hidden rounded-md border">
                {scripts.map((script) => (
                  <li key={script.id} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {copy.scripts.history.version(script.version)}
                      </span>
                      <span
                        className={
                          script.isActive
                            ? "text-success text-xs font-medium"
                            : "text-muted-foreground text-xs"
                        }
                      >
                        {script.isActive
                          ? copy.scripts.history.active
                          : copy.scripts.history.inactive}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDateTime(script.createdAt)} ·{" "}
                      {copy.scripts.history.questionsCount(script.questions.length)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </form>
      </Form>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.scripts.confirm.title}</DialogTitle>
            <DialogDescription>{copy.scripts.confirm.body(nextVersion)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {copy.scripts.confirm.cancel}
            </Button>
            <Button onClick={confirmSave} disabled={createScript.isPending}>
              {copy.scripts.confirm.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
