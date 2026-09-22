import { describe, expect, it } from "vitest";
import {
  addQuestion,
  draftFromScript,
  draftToCreate,
  emptyDraft,
  findDraftIssues,
  moveQuestion,
  nextVersionFor,
  optionsRequired,
  removeQuestion,
  suggestKey,
  type DraftQuestion,
  type ScriptDraft,
} from "./script-draft";
import type { Script } from "../../../shared/schemas";

function question(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
  return {
    id: crypto.randomUUID(),
    key: "has_delivery",
    keyLocked: false,
    keyTouched: false,
    originallyLocked: false,
    label: "Do you offer delivery?",
    type: "yes_no",
    options: [],
    required: false,
    ...overrides,
  };
}

const SAVED_SCRIPT: Script = {
  id: 1,
  name: "default",
  version: 2,
  isActive: true,
  createdAt: 1_700_000_000_000,
  questions: [
    { key: "has_delivery", label: "Do you offer delivery?", type: "yes_no", required: true },
    {
      key: "pos_system",
      label: "Which POS do you use?",
      type: "single",
      options: ["None", "Paper"],
    },
  ],
};

describe("suggestKey", () => {
  it("slugifies a label to snake_case", () => {
    expect(suggestKey("Do you offer delivery?", [])).toBe("do_you_offer_delivery");
  });

  it("strips accents rather than dropping the letters", () => {
    expect(suggestKey("Café servi ?", [])).toBe("cafe_servi");
  });

  it("falls back to q when the label has no latin letters", () => {
    expect(suggestKey("😀😀", [])).toBe("q");
    expect(suggestKey("", [])).toBe("q");
  });

  it("prefixes a leading digit, since a key must start with a letter", () => {
    expect(suggestKey("2 plats du jour", [])).toMatch(/^[a-z]/);
    expect(suggestKey("2 plats du jour", [])).toBe("q_2_plats_du_jour");
  });

  it("dedupes against existing keys by appending a counter", () => {
    expect(suggestKey("Delivery", ["delivery"])).toBe("delivery_2");
    expect(suggestKey("Delivery", ["delivery", "delivery_2"])).toBe("delivery_3");
  });

  it("keeps the result within 60 characters even with a suffix", () => {
    const longLabel = "a".repeat(80);
    const key = suggestKey(longLabel, [longLabel.slice(0, 60)]);
    expect(key.length).toBeLessThanOrEqual(60);
    expect(key.endsWith("_2")).toBe(true);
  });
});

describe("draftFromScript", () => {
  it("returns an empty draft when there is no active script", () => {
    expect(draftFromScript(null)).toEqual(emptyDraft());
  });

  it("locks every key from the saved script", () => {
    const draft = draftFromScript(SAVED_SCRIPT);
    expect(draft.name).toBe("default");
    expect(draft.questions).toHaveLength(2);
    expect(draft.questions.every((q) => q.keyLocked)).toBe(true);
    expect(draft.questions[1]?.options).toEqual(["None", "Paper"]);
  });
});

describe("addQuestion / removeQuestion", () => {
  it("appends a new, unlocked question with a deduped key", () => {
    const questions = addQuestion([question({ key: "q" })]);
    expect(questions).toHaveLength(2);
    expect(questions[1]?.keyLocked).toBe(false);
    expect(questions[1]?.key).toBe("q_2");
  });

  it("removes only the matching id", () => {
    const a = question({ id: "a" });
    const b = question({ id: "b" });
    expect(removeQuestion([a, b], "a")).toEqual([b]);
  });
});

describe("moveQuestion", () => {
  it("moves an item from one index to another", () => {
    expect(moveQuestion([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveQuestion([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  });

  it("is a no-op copy for an out-of-range index", () => {
    expect(moveQuestion([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
    expect(moveQuestion([1, 2, 3], -1, 1)).toEqual([1, 2, 3]);
  });

  it("is a no-op when from equals to", () => {
    const list = [1, 2, 3];
    expect(moveQuestion(list, 1, 1)).toEqual(list);
  });
});

describe("optionsRequired", () => {
  it("is true only for single and multi", () => {
    expect(optionsRequired("single")).toBe(true);
    expect(optionsRequired("multi")).toBe(true);
    expect(optionsRequired("yes_no")).toBe(false);
    expect(optionsRequired("text")).toBe(false);
    expect(optionsRequired("number")).toBe(false);
    expect(optionsRequired("rating")).toBe(false);
  });
});

describe("draftToCreate", () => {
  it("trims the name and every question field", () => {
    const draft: ScriptDraft = {
      name: "  default  ",
      questions: [question({ label: "  Delivery?  ", key: " has_delivery " })],
    };
    const created = draftToCreate(draft);
    expect(created.name).toBe("default");
    expect(created.questions[0]).toMatchObject({ label: "Delivery?", key: "has_delivery" });
  });

  it("omits options entirely for a type that takes none", () => {
    const created = draftToCreate({
      name: "default",
      questions: [question({ type: "yes_no", options: ["stray"] })],
    });
    expect(created.questions[0]).not.toHaveProperty("options");
  });

  it("keeps options for single/multi, trimmed and with blanks dropped", () => {
    const created = draftToCreate({
      name: "default",
      questions: [question({ type: "multi", options: [" Delivery ", "", "Takeout"] })],
    });
    expect(created.questions[0]?.options).toEqual(["Delivery", "Takeout"]);
  });
});

describe("nextVersionFor", () => {
  it("is 1 when nothing with this name exists yet", () => {
    expect(nextVersionFor([], "default")).toBe(1);
  });

  it("is one past the highest existing version for that name", () => {
    expect(nextVersionFor([SAVED_SCRIPT], "default")).toBe(3);
  });

  it("does not count versions of a different name", () => {
    expect(nextVersionFor([SAVED_SCRIPT], "onboarding")).toBe(1);
  });
});

describe("findDraftIssues", () => {
  it("is empty for a valid draft", () => {
    const draft: ScriptDraft = { name: "default", questions: [question()] };
    expect(findDraftIssues(draft)).toEqual([]);
  });

  it("flags an empty name and an empty question list", () => {
    const issues = findDraftIssues(emptyDraft());
    expect(issues).toContainEqual({ kind: "empty_name" });
    expect(issues).toContainEqual({ kind: "no_questions" });
  });

  it("flags an empty label", () => {
    const q = question({ label: "  " });
    const issues = findDraftIssues({ name: "default", questions: [q] });
    expect(issues).toContainEqual({ kind: "empty_label", questionId: q.id });
  });

  it("flags a key that is not snake_case", () => {
    const q = question({ key: "Has Delivery" });
    const issues = findDraftIssues({ name: "default", questions: [q] });
    expect(issues).toContainEqual({ kind: "invalid_key", questionId: q.id });
  });

  it("flags two questions sharing a key — the second one, not the first", () => {
    const a = question({ id: "a", key: "dup" });
    const b = question({ id: "b", key: "dup" });
    const issues = findDraftIssues({ name: "default", questions: [a, b] });
    expect(issues).toContainEqual({ kind: "duplicate_key", questionId: "b" });
    expect(issues).not.toContainEqual({ kind: "duplicate_key", questionId: "a" });
  });

  it("flags single/multi with no non-blank option", () => {
    const q = question({ type: "single", options: ["  ", ""] });
    const issues = findDraftIssues({ name: "default", questions: [q] });
    expect(issues).toContainEqual({ kind: "missing_options", questionId: q.id });
  });

  it("does not require options for the other four types", () => {
    for (const type of ["yes_no", "text", "number", "rating"] as const) {
      const q = question({ type, options: [] });
      const issues = findDraftIssues({ name: "default", questions: [q] });
      expect(issues).not.toContainEqual({ kind: "missing_options", questionId: q.id });
    }
  });
});
