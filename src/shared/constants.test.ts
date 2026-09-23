import { describe, expect, it } from "vitest";
import {
  IMPORT_ROWS_PER_REQUEST,
  MAX_REQUEST_BYTES,
  OPEN_STATUSES,
  OUTCOMES,
  OUTCOME_TO_STATUS,
  STATUSES,
  SYNC_PROSPECTS_PER_REQUEST,
  SYNC_VISITS_PER_REQUEST,
  isOpen,
} from "./constants";
import { prospectBatchSchema, scriptCreateSchema, syncRequestSchema } from "./schemas";

/**
 * INVARIANT 3 lives in this table. It is the rule the whole product turns on:
 * get it wrong and prospects silently drop off, or never leave, an agent's list.
 * The expectations below are copied from docs/domains/prospecting.md.
 */
describe("OUTCOME_TO_STATUS", () => {
  it("matches the table in docs/domains/prospecting.md", () => {
    expect(OUTCOME_TO_STATUS).toEqual({
      no_contact: "follow_up",
      interested: "follow_up",
      not_interested: "rejected",
      follow_up: "follow_up",
      converted: "converted",
    });
  });

  it("maps every outcome to a real status", () => {
    for (const outcome of OUTCOMES) {
      expect(STATUSES).toContain(OUTCOME_TO_STATUS[outcome]);
    }
  });

  it("never produces `new` or `assigned` — those are admin-only transitions", () => {
    for (const outcome of OUTCOMES) {
      expect(["new", "assigned"]).not.toContain(OUTCOME_TO_STATUS[outcome]);
    }
  });
});

describe("open statuses", () => {
  it("puts new, assigned and follow_up on an agent's list, and nothing else", () => {
    expect([...OPEN_STATUSES]).toEqual(["new", "assigned", "follow_up"]);
    expect(isOpen("converted")).toBe(false);
    expect(isOpen("rejected")).toBe(false);
  });
});

/**
 * The byte cap and the count caps have to agree, and nothing but a test keeps
 * them agreeing.
 *
 * Each case below builds the largest payload the *schemas* allow, parses it to
 * prove it is legitimate, and then asserts it fits MAX_REQUEST_BYTES. Raise a
 * count cap or a text length without raising the byte cap and the route starts
 * answering 413 to requests it is supposed to accept — which, on the sync path,
 * is an outbox that never drains (INVARIANT 5).
 */
describe("MAX_REQUEST_BYTES", () => {
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
  const maxShortText = "é".repeat(200);

  it("fits the largest import batch the schema allows", () => {
    const batch = {
      source: "csv" as const,
      rows: Array.from({ length: IMPORT_ROWS_PER_REQUEST }, () => ({
        name: maxShortText,
        type: "restaurant" as const,
        lat: -12.345678,
        lng: -123.456789,
        address: maxShortText,
        phone: maxShortText,
        website: maxShortText,
        cuisine: maxShortText,
        sourceRef: maxShortText,
      })),
    };
    expect(prospectBatchSchema.safeParse(batch).success).toBe(true);
    expect(bytes(batch)).toBeLessThan(MAX_REQUEST_BYTES);
  });

  it("fits the largest script the schema allows", () => {
    const script = {
      name: maxShortText,
      questions: Array.from({ length: 50 }, (_, i) => ({
        key: `question_${i}`,
        label: maxShortText,
        type: "multi" as const,
        options: Array.from({ length: 30 }, () => maxShortText),
      })),
    };
    expect(scriptCreateSchema.safeParse(script).success).toBe(true);
    expect(bytes(script)).toBeLessThan(MAX_REQUEST_BYTES);
  });

  it("fits a full sync of maxed prospects, maxed notes and a 50-question script answered", () => {
    const now = Date.now();
    const payload = {
      clientVersion: 1,
      prospects: Array.from({ length: SYNC_PROSPECTS_PER_REQUEST }, () => ({
        id: crypto.randomUUID(),
        name: maxShortText,
        type: "restaurant" as const,
        lat: -12.345678,
        lng: -123.456789,
        address: maxShortText,
        phone: maxShortText,
        createdAt: now,
      })),
      visits: Array.from({ length: SYNC_VISITS_PER_REQUEST }, () => ({
        id: crypto.randomUUID(),
        prospectId: crypto.randomUUID(),
        visitedAt: now,
        flyerGiven: true,
        outcome: "interested" as const,
        notes: "é".repeat(2000),
        // The real ceiling is a script answered, not an empty `answers`. A
        // 50-question script is scriptCreateSchema's own maximum; the mix of
        // types is what a real questionnaire returns.
        answers: Object.fromEntries(
          Array.from({ length: 50 }, (_, q) => [
            `question_${q}`,
            q % 3 === 0 ? true : q % 3 === 1 ? 42 : "é".repeat(120),
          ]),
        ),
      })),
    };
    expect(syncRequestSchema.safeParse(payload).success).toBe(true);
    expect(bytes(payload)).toBeLessThan(MAX_REQUEST_BYTES);
  });
});
