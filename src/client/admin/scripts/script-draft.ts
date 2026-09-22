/**
 * The script editor's rules, pure and testable — docs/domains/scripts.md.
 *
 * `ScriptsScreen.tsx` composes these; nothing here touches the DOM or
 * react-hook-form, so every rule the editor enforces is covered without a
 * component test (this repo has none — no testing-library, no jsdom).
 *
 * A `DraftQuestion` is the editor's row shape, a superset of the wire
 * `Question`: it carries a stable `id` for drag-and-drop and `useFieldArray`,
 * `keyLocked` (the key already exists in the saved version this draft started
 * from, and saving reuses it as an answer key — docs/domains/scripts.md says
 * keys are "stable, and never reused with a different meaning") and
 * `keyTouched` (the admin edited the key by hand, so label edits stop
 * re-suggesting one). `draftToCreate` strips all three before the payload
 * goes to `scriptCreateSchema`.
 */
import type { QuestionType } from "../../../shared/constants";
import type { Question, Script } from "../../../shared/schemas";

export type DraftQuestion = {
  id: string;
  key: string;
  keyLocked: boolean;
  keyTouched: boolean;
  /**
   * True for the lifetime of the row when it came from a saved version, even
   * after `keyLocked` is deliberately turned off — so the editor keeps
   * warning that unlocking it orphans older answers, not just once.
   */
  originallyLocked: boolean;
  label: string;
  type: QuestionType;
  /** Always an array in the draft, even for a type that takes no options — see `draftToCreate`. */
  options: string[];
  required: boolean;
};

export type ScriptDraft = {
  name: string;
  questions: DraftQuestion[];
};

const KEY_MAX = 60;
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function emptyDraft(): ScriptDraft {
  return { name: "", questions: [] };
}

/** The starting point for a new version: the active script, or a blank draft when there is none yet. */
export function draftFromScript(script: Script | null): ScriptDraft {
  if (!script) return emptyDraft();
  return {
    name: script.name,
    questions: script.questions.map((question) => ({
      id: crypto.randomUUID(),
      key: question.key,
      keyLocked: true,
      keyTouched: false,
      originallyLocked: true,
      label: question.label,
      type: question.type,
      options: question.options ?? [],
      required: question.required ?? false,
    })),
  };
}

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: "Café" -> "Cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KEY_MAX);
}

/**
 * A snake_case key guessed from a question's label, deduped against the keys
 * already used elsewhere in the draft. `""` and labels with no latin letters
 * (only digits, punctuation, emoji) fall back to `"q"` — a key must start
 * with a letter (`questionSchema`), which a slug of digits alone cannot.
 */
export function suggestKey(label: string, existingKeys: readonly string[]): string {
  const slug = slugify(label);
  const candidateBase = KEY_PATTERN.test(slug) ? slug : `q_${slug}`.replace(/_+$/, "");
  const base = KEY_PATTERN.test(candidateBase) && candidateBase.length > 0 ? candidateBase : "q";

  if (!existingKeys.includes(base)) return base;

  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, KEY_MAX - suffix.length)}${suffix}`;
    if (!existingKeys.includes(candidate)) return candidate;
  }
}

function newDraftQuestion(existingKeys: readonly string[]): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    key: suggestKey("", existingKeys),
    keyLocked: false,
    keyTouched: false,
    originallyLocked: false,
    label: "",
    type: "yes_no",
    options: [],
    required: false,
  };
}

export function addQuestion(questions: readonly DraftQuestion[]): DraftQuestion[] {
  return [...questions, newDraftQuestion(questions.map((q) => q.key))];
}

export function removeQuestion(questions: readonly DraftQuestion[], id: string): DraftQuestion[] {
  return questions.filter((q) => q.id !== id);
}

/** Reorders by position; out-of-range indices are a no-op copy, never a throw. */
export function moveQuestion<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  // `from` was just checked to be a valid index into `list`, so this element
  // always exists; the guard only satisfies noUncheckedIndexedAccess.
  if (item === undefined) return [...list];
  next.splice(to, 0, item);
  return next;
}

/** `single` and `multi` answer with one of `options`; every other type takes none (questionSchema). */
export function optionsRequired(type: QuestionType): boolean {
  return type === "single" || type === "multi";
}

/**
 * The draft as the wire payload — trimmed, and with `options` present only
 * where `questionSchema` allows it. This is what gets validated against
 * `scriptCreateSchema` before the request goes out.
 */
export function draftToCreate(draft: ScriptDraft): { name: string; questions: Question[] } {
  return {
    name: draft.name.trim(),
    questions: draft.questions.map((question): Question => {
      const base = {
        key: question.key.trim(),
        label: question.label.trim(),
        type: question.type,
        required: question.required,
      };
      if (!optionsRequired(question.type)) return base;
      return {
        ...base,
        options: question.options
          .map((option) => option.trim())
          .filter((option) => option.length > 0),
      };
    }),
  };
}

/** Version N+1 for this draft's name — what the confirmation dialog states before it is true. */
export function nextVersionFor(scripts: readonly Script[], name: string): number {
  const trimmed = name.trim();
  const versions = scripts
    .filter((script) => script.name === trimmed)
    .map((script) => script.version);
  return versions.length > 0 ? Math.max(...versions) + 1 : 1;
}

export type DraftIssue =
  | { kind: "empty_name" }
  | { kind: "no_questions" }
  | { kind: "empty_label"; questionId: string }
  | { kind: "invalid_key"; questionId: string }
  | { kind: "duplicate_key"; questionId: string }
  | { kind: "missing_options"; questionId: string };

/**
 * Everything `scriptCreateSchema` would 400 on, found before the request is
 * ever sent — so the screen can disable Save and point at the exact row
 * instead of the admin discovering it from a rejected POST.
 */
export function findDraftIssues(draft: ScriptDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!draft.name.trim()) issues.push({ kind: "empty_name" });
  if (draft.questions.length === 0) issues.push({ kind: "no_questions" });

  const seenKeys = new Set<string>();
  for (const question of draft.questions) {
    const key = question.key.trim();
    const label = question.label.trim();

    if (!label) issues.push({ kind: "empty_label", questionId: question.id });

    if (!KEY_PATTERN.test(key) || key.length > KEY_MAX) {
      issues.push({ kind: "invalid_key", questionId: question.id });
    } else if (seenKeys.has(key)) {
      issues.push({ kind: "duplicate_key", questionId: question.id });
    } else {
      seenKeys.add(key);
    }

    if (optionsRequired(question.type) && question.options.every((option) => !option.trim())) {
      issues.push({ kind: "missing_options", questionId: question.id });
    }
  }

  return issues;
}
