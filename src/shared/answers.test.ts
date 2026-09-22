import { describe, expect, it } from "vitest";
import { answerableQuestions, answersSchemaFor, isAnswerable } from "./answers";
import type { Question } from "./schemas";

/**
 * docs/domains/scripts.md is the source of truth for the type → answer table.
 * These tests are that table, so a change to one must break the other.
 */

const q = (over: Partial<Question> & Pick<Question, "key" | "type">): Question => ({
  label: "Une question",
  ...over,
});

const yesNo = q({ key: "has_delivery", type: "yes_no", required: true });
const single = q({ key: "pos", type: "single", options: ["Aucune", "Papier"], required: true });
const multi = q({ key: "days", type: "multi", options: ["lun", "mar"], required: true });
const text = q({ key: "note", type: "text", required: true });
const number = q({ key: "covers", type: "number", required: true });
const rating = q({ key: "interest", type: "rating", required: true });

const accepts = (questions: Question[], answers: unknown, enforceRequired = true) =>
  answersSchemaFor(questions, { enforceRequired }).safeParse(answers).success;

describe("each question type accepts the answer its control produces", () => {
  it.each([
    ["yes_no", [yesNo], { has_delivery: true }],
    ["single", [single], { pos: "Papier" }],
    ["multi", [multi], { days: ["lun"] }],
    ["text", [text], { note: "ferme le lundi" }],
    ["number", [number], { covers: 40 }],
    ["rating", [rating], { interest: 5 }],
  ])("%s", (_label, questions, answers) => {
    expect(accepts(questions, answers)).toBe(true);
  });
});

describe("and refuses an answer of the wrong shape", () => {
  it.each([
    ["yes_no given a string", [yesNo], { has_delivery: "oui" }],
    ["single given an option that is not offered", [single], { pos: "Autre" }],
    ["multi given a member that is not offered", [multi], { days: ["dim"] }],
    ["number given text", [number], { covers: "quarante" }],
    ["rating below 1", [rating], { interest: 0 }],
    ["rating above 5", [rating], { interest: 6 }],
    ["rating that is not whole", [rating], { interest: 3.5 }],
  ])("%s", (_label, questions, answers) => {
    expect(accepts(questions, answers)).toBe(false);
  });
});

describe("required", () => {
  it("refuses a missing answer", () => {
    expect(accepts([yesNo], {})).toBe(false);
  });

  it("refuses empty text, which is not an answer", () => {
    expect(accepts([text], { note: "" })).toBe(false);
  });

  it("refuses an empty multi selection", () => {
    expect(accepts([multi], { days: [] })).toBe(false);
  });

  it("leaves an optional question optional", () => {
    expect(accepts([q({ key: "note", type: "text" })], {})).toBe(true);
  });
});

/**
 * field-operations.md: "Required questions of the active script must be
 * answered unless the outcome is `no_contact`." Nobody was there to ask.
 */
describe("when the outcome is no_contact, required is relaxed", () => {
  it.each([
    ["a missing answer", [yesNo], {}],
    ["empty text", [text], { note: "" }],
    ["an empty multi selection", [multi], { days: [] }],
  ])("accepts %s", (_label, questions, answers) => {
    expect(accepts(questions, answers, false)).toBe(true);
  });

  it("but a wrong answer is still wrong — relaxing required never relaxes valid", () => {
    expect(accepts([rating], { interest: 9 }, false)).toBe(false);
  });
});

describe("a whole script at once", () => {
  const all = [yesNo, single, multi, text, number, rating];

  it("accepts every question answered", () => {
    expect(
      accepts(all, {
        has_delivery: false,
        pos: "Aucune",
        days: ["lun", "mar"],
        note: "rappeler",
        covers: 12,
        interest: 3,
      }),
    ).toBe(true);
  });

  it("refuses when one required answer is missing", () => {
    expect(
      accepts(all, { has_delivery: false, pos: "Aucune", days: ["lun"], note: "x", covers: 12 }),
    ).toBe(false);
  });

  it("names the question key in the issue path, so the right control is marked", () => {
    const result = answersSchemaFor(all, { enforceRequired: true }).safeParse({
      has_delivery: false,
      pos: "Aucune",
      days: [],
      note: "",
      covers: 1,
      interest: 9,
    });

    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")).sort();
    expect(paths).toEqual(["days", "interest", "note"]);
  });
});

/**
 * A script is data, not contract shape: `clientVersion` does not gate it, so a
 * phone can pull a question its build has never heard of. Losing the visit form
 * to one is losing the visit (INVARIANT 5).
 */
describe("a question this build cannot ask is skipped, never fatal", () => {
  const future = q({ key: "signature", type: "signature" as Question["type"], required: true });
  const emptyOptions = q({ key: "pos", type: "single", options: [], required: true });
  const missingOptions = q({ key: "pos2", type: "single", required: true });

  it.each([
    ["a type this build does not know", future],
    ["a single with no options to choose from", emptyOptions],
    ["a single whose options are absent entirely", missingOptions],
  ])("treats %s as unanswerable", (_label, question) => {
    expect(isAnswerable(question)).toBe(false);
  });

  it("treats a well-formed question as answerable", () => {
    expect(isAnswerable(yesNo)).toBe(true);
  });

  it("renders only the answerable ones, in script order", () => {
    expect(answerableQuestions([yesNo, future, emptyOptions, single]).map((x) => x.key)).toEqual([
      "has_delivery",
      "pos",
    ]);
  });

  it("builds a schema without throwing, and the rest of the form still works", () => {
    const mixed = [yesNo, future, emptyOptions];
    expect(accepts(mixed, { has_delivery: true })).toBe(true);
    // the answerable question's requiredness still bites...
    expect(accepts(mixed, {})).toBe(false);
    // ...and the skipped ones never block the save.
    expect(accepts(mixed, { has_delivery: false })).toBe(true);
  });

  it("lets a visit save against a script it understands none of", () => {
    expect(accepts([future], {})).toBe(true);
  });
});
