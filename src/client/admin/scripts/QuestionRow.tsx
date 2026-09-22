/**
 * One question in the script editor — docs/design.md#the-script-editor.
 *
 * A row in a bordered, divided list, not a card: the drag handle is the only
 * affordance for reordering, and `useSortable` supplies both the pointer and
 * (via the `KeyboardSensor` wired in `ScriptsScreen`) the keyboard behaviour
 * for it.
 */
import { useSortable } from "@dnd-kit/sortable";
import { GripVerticalIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { copy, QUESTION_TYPE_LABELS } from "../../copy";
import { QUESTION_TYPES, type QuestionType } from "../../../shared/constants";
import { suggestKey, type ScriptDraft } from "./script-draft";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";

function transformStyle(transform: { x: number; y: number } | null): string | undefined {
  // `@dnd-kit/utilities`'s `CSS.Transform.toString` is not a dependency of this
  // repo (only core, sortable and modifiers are); a translate3d is all a
  // vertical sortable list needs, so it is written out instead of pulling in
  // another package for one call.
  return transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined;
}

export function QuestionRow({
  form,
  index,
  id,
  otherKeys,
  onRemove,
}: {
  form: UseFormReturn<ScriptDraft>;
  index: number;
  id: string;
  otherKeys: string[];
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const type = useWatch({ control: form.control, name: `questions.${index}.type` });
  const label = useWatch({ control: form.control, name: `questions.${index}.label` });
  const keyLocked = useWatch({ control: form.control, name: `questions.${index}.keyLocked` });
  const keyTouched = useWatch({ control: form.control, name: `questions.${index}.keyTouched` });
  const originallyLocked = useWatch({
    control: form.control,
    name: `questions.${index}.originallyLocked`,
  });
  const options = useWatch({ control: form.control, name: `questions.${index}.options` }) ?? [];
  const optionsShown = type === "single" || type === "multi";
  const rowTitle = label.trim() || copy.scripts.question.untitled;

  function handleTypeChange(next: QuestionType) {
    form.setValue(`questions.${index}.type`, next, { shouldDirty: true });
    if ((next === "single" || next === "multi") && options.length === 0) {
      form.setValue(`questions.${index}.options`, [""], { shouldDirty: true });
    }
  }

  function handleUnlockKey() {
    form.setValue(`questions.${index}.keyLocked`, false, { shouldDirty: true });
  }

  function setOption(optionIndex: number, value: string) {
    const next = [...options];
    next[optionIndex] = value;
    form.setValue(`questions.${index}.options`, next, { shouldDirty: true });
  }

  function removeOption(optionIndex: number) {
    form.setValue(
      `questions.${index}.options`,
      options.filter((_, i) => i !== optionIndex),
      { shouldDirty: true },
    );
  }

  function addOption() {
    form.setValue(`questions.${index}.options`, [...options, ""], { shouldDirty: true });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: transformStyle(transform), transition: transition ?? undefined }}
      className={
        "border-border bg-card flex gap-3 border-b px-3.5 py-3 last:border-b-0" +
        (isDragging ? " relative z-10 shadow-md" : "")
      }
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground mt-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
        aria-label={copy.scripts.question.dragHandle(rowTitle)}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>

      <span className="text-muted-foreground tnum mt-2.5 w-4 shrink-0 text-right text-sm">
        {index + 1}
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        <FormField
          control={form.control}
          name={`questions.${index}.label`}
          render={({ field, fieldState }) => (
            <FormItem className="gap-1">
              <FormLabel className="sr-only">{copy.scripts.question.label}</FormLabel>
              <FormControl>
                <Input
                  placeholder={copy.scripts.question.labelPlaceholder}
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!keyLocked && !keyTouched) {
                      form.setValue(
                        `questions.${index}.key`,
                        suggestKey(e.target.value, otherKeys),
                        {
                          shouldDirty: true,
                        },
                      );
                    }
                  }}
                />
              </FormControl>
              <FormMessage>
                {fieldState.error ? copy.scripts.errors.emptyLabel : undefined}
              </FormMessage>
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-4">
          <FormField
            control={form.control}
            name={`questions.${index}.type`}
            render={({ field }) => (
              <FormItem className="w-44 gap-1">
                <FormLabel className="sr-only">{copy.scripts.question.type}</FormLabel>
                <Select value={field.value} onValueChange={handleTypeChange}>
                  <FormControl>
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name={`questions.${index}.required`}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="text-sm font-normal">
                  {copy.scripts.question.required}
                </FormLabel>
              </FormItem>
            )}
          />
        </div>

        {optionsShown && (
          <FormField
            control={form.control}
            name={`questions.${index}.options`}
            render={({ fieldState }) => (
              <FormItem className="gap-1.5">
                <FormLabel className="text-muted-foreground text-xs font-normal">
                  {copy.scripts.question.options}
                </FormLabel>
                <div className="space-y-1.5">
                  {options.map((option, optionIndex) => (
                    // Options are add/remove only, never reordered, so the
                    // index is a stable enough key for this short list.
                    <div key={optionIndex} className="flex items-center gap-1.5">
                      <Input
                        value={option}
                        placeholder={copy.scripts.question.optionPlaceholder(optionIndex + 1)}
                        onChange={(e) => setOption(optionIndex, e.target.value)}
                        className="h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={copy.scripts.question.removeOption(optionIndex + 1)}
                        onClick={() => removeOption(optionIndex)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={addOption}
                >
                  <PlusIcon /> {copy.scripts.question.addOption}
                </Button>
                <FormMessage>
                  {fieldState.error ? copy.scripts.errors.missingOptions : undefined}
                </FormMessage>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name={`questions.${index}.key`}
          render={({ field, fieldState }) => (
            <FormItem className="gap-1">
              <FormLabel className="text-muted-foreground text-xs font-normal">
                {copy.scripts.question.key}
              </FormLabel>
              <div className="flex items-center gap-2">
                <Input
                  {...field}
                  disabled={keyLocked}
                  className="tnum h-8 w-56 font-mono text-xs"
                  onChange={(e) => {
                    field.onChange(e);
                    form.setValue(`questions.${index}.keyTouched`, true, { shouldDirty: true });
                  }}
                />
                {keyLocked && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleUnlockKey}>
                    <LockIcon className="size-3.5" /> {copy.scripts.question.unlockKey}
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {keyLocked
                  ? copy.scripts.question.keyLocked
                  : originallyLocked
                    ? copy.scripts.question.keyUnlockedWarning
                    : copy.scripts.question.keyHint}
              </p>
              <FormMessage>
                {fieldState.error?.type === "duplicate"
                  ? copy.scripts.errors.duplicateKey
                  : fieldState.error
                    ? copy.scripts.errors.invalidKey
                    : undefined}
              </FormMessage>
            </FormItem>
          )}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-0.5 shrink-0"
        aria-label={copy.scripts.question.remove(rowTitle)}
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}
