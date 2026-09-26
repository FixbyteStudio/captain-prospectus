/**
 * Visite step 1: Résultat (GH #123) — the step indicator, the Flyer remis
 * card, the five outcome cards and the missing-outcome focus, all offline.
 *
 * `useSync` is mocked (as `TodayScreen.test.tsx` does) so nothing here depends
 * on the sync engine's timers, and `../api` is mocked to reject every call —
 * the visit history fetch failing is simply "offline" from this screen's own
 * point of view (matrix row "Offline"), and the form must still work.
 *
 * INVARIANT 3: an outcome card never carries a status colour, before or after
 * it is picked, and its hint never spells out a status word — though its own
 * label can coincide with one ("À relancer", "Converti"), since the label
 * names the outcome, not the status. That is what most of these tests check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { copy, OUTCOME_HINTS, STATUS_LABELS } from "../copy";
import type { Prospect, Script } from "../../shared/schemas";
import { OUTCOMES, type Outcome } from "../../shared/constants";
import { fieldDb, setMeta } from "./db";
import { questionDomId } from "./ScriptQuestions";
import { VisitScreen } from "./VisitScreen";

vi.mock("./useSync", () => ({
  useSyncState: () => ({ identity: "agent@example.com", syncNow: async () => {} }),
}));

// Offline is the default state for a field test: nothing here should depend
// on this call ever resolving.
vi.mock("../api", () => ({
  apiFetch: () => Promise.reject(new Error("offline")),
}));

const PROSPECT: Prospect = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Le Bouchon des Filles",
  type: "restaurant",
  lat: null,
  lng: null,
  address: null,
  phone: null,
  website: null,
  cuisine: null,
  source: "csv",
  status: "assigned",
  assignedTo: "agent@example.com",
  lastVisitAt: null,
  nextVisitAt: null,
};

const SCRIPT: Script = {
  id: 1,
  name: "default",
  version: 1,
  isActive: true,
  createdAt: 1_700_000_000_000,
  questions: [
    { key: "delivery", label: "Proposez-vous la livraison ?", type: "yes_no", required: true },
  ],
};

/** Step 2's DOM matrix (yes/no, single, rating, number) in one script, so a
 * single fixture covers every choice control DESIGN.md's Choice controls
 * (field) describes. */
const SCRIPT2: Script = {
  id: 2,
  name: "multi",
  version: 1,
  isActive: true,
  createdAt: 1_700_000_000_000,
  questions: [
    { key: "delivery", label: "Proposez-vous la livraison ?", type: "yes_no", required: true },
    {
      key: "cash_register",
      label: "Quelle caisse utilisez-vous ?",
      type: "single",
      options: ["Aucune", "Papier", "Électronique"],
      required: true,
    },
    { key: "satisfaction", label: "Satisfaction ?", type: "rating", required: true },
    { key: "seats", label: "Combien de places ?", type: "number", required: true },
  ],
};

/**
 * The active script is read from Dexie in an effect (`getMeta`), one render
 * after mount — `hasQuestions` is `false` until it settles, which is also the
 * one-step shape. A test that asserts before it settles could pass by
 * accident on the wrong render. `expectContinue` names which button the test
 * actually expects, and `findByRole` polls (flushing pending promises under
 * the hood) until that render is the one on screen.
 */
async function renderVisit({ expectContinue }: { expectContinue: boolean }) {
  const utils = render(
    <MemoryRouter initialEntries={[`/tournee/${PROSPECT.id}`]}>
      <Routes>
        <Route path="/tournee/:id" element={<VisitScreen />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: PROSPECT.name });
  await screen.findByRole("button", {
    name: expectContinue ? copy.visit.continue : copy.visit.save,
  });
  return utils;
}

/** Renders with `SCRIPT2`, picks `outcome` and lands on step 2's questions —
 * the shared setup for every choice-control test below. */
async function toStep2(user: ReturnType<typeof userEvent.setup>, outcome: Outcome = "interested") {
  await setMeta(fieldDb, "script", SCRIPT2);
  await renderVisit({ expectContinue: true });
  await user.click(outcomeRadio(outcome));
  await user.click(screen.getByRole("button", { name: copy.visit.continue }));
  await screen.findByText(copy.visit.step(2, 2, copy.visit.questions));
}

/** The card's own input, found by its stable `value` rather than its
 * accessible name (`aria-labelledby` ties the name to the label alone, but
 * `value` is simpler still and never changes). */
function outcomeRadio(outcome: Outcome): HTMLInputElement {
  const radio = screen
    .getAllByRole("radio")
    .find((el) => (el as HTMLInputElement).value === outcome);
  if (!radio) throw new Error(`no outcome radio for ${outcome}`);
  return radio as HTMLInputElement;
}

function outcomeCards(): HTMLElement[] {
  return OUTCOMES.map((outcome) => outcomeRadio(outcome).closest("label") as HTMLElement);
}

/** Every class attribute in a card's own subtree — the icon tile and the
 * check are `<span>`/`<svg>` descendants, not the `<label>` itself, so a
 * status colour smuggled onto either would slip past a check of the label's
 * `className` alone. */
function classAttributesOf(card: HTMLElement): string[] {
  const attrs = [card.getAttribute("class") ?? ""];
  for (const el of card.querySelectorAll("*")) {
    attrs.push(el.getAttribute("class") ?? "");
  }
  return attrs;
}

/** invariant 3: no card, or anything inside it, ever carries a status colour. */
function assertNoCardCarriesStatus() {
  for (const card of outcomeCards()) {
    for (const classAttr of classAttributesOf(card)) {
      expect(classAttr).not.toMatch(/outcome-|success|warn|destructive|status/);
    }
  }
}

beforeEach(async () => {
  await fieldDb.prospects.add(PROSPECT);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    fieldDb.prospects.clear(),
    fieldDb.outboxVisits.clear(),
    fieldDb.outboxProspects.clear(),
    fieldDb.visitHistory.clear(),
    fieldDb.meta.clear(),
  ]);
});

describe("outcome hints (copy.ts)", () => {
  it("never spells out a status name, case-insensitively (invariant 3)", () => {
    const statusWords = Object.values(STATUS_LABELS).map((word) => word.toLowerCase());
    for (const outcome of OUTCOMES) {
      const hint = OUTCOME_HINTS[outcome].toLowerCase();
      for (const word of statusWords) {
        expect(hint).not.toContain(word);
      }
    }
  });
});

describe("VisitScreen — step 1", () => {
  it("opens a two-step visit with the step indicator, the flyer card and five outcome cards", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    await renderVisit({ expectContinue: true });

    expect(screen.getByText(copy.visit.step(1, 2, copy.visit.outcome))).toBeTruthy();
    expect(screen.getByText("Restaurant")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: new RegExp(copy.visit.flyerGiven) })).toBeTruthy();
    expect(screen.getByText(copy.visit.flyerHint)).toBeTruthy();

    for (const outcome of OUTCOMES) {
      expect(outcomeRadio(outcome)).toBeTruthy();
      expect(screen.getByText(OUTCOME_HINTS[outcome])).toBeTruthy();
    }
    assertNoCardCarriesStatus();
  });

  it("shows no step indicator, and reads Enregistrer la visite, with no cached script", async () => {
    await renderVisit({ expectContinue: false });

    expect(screen.queryByText(/^Étape/)).toBeNull();
  });

  it("treats a script whose questions are all unanswerable as no script at all", async () => {
    // `single` with no options can never be answered (`isAnswerable`), so the
    // form has nothing to ask on step 2 — same one-step shape as no script.
    const unanswerable: Script = {
      ...SCRIPT,
      questions: [{ key: "cash_register", label: "Quelle caisse ?", type: "single", options: [] }],
    };
    await setMeta(fieldDb, "script", unanswerable);
    await renderVisit({ expectContinue: false });

    expect(screen.queryByText(/^Étape/)).toBeNull();
  });

  it("selects one outcome card at a time, and no card or its descendants ever carry a status colour", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    assertNoCardCarriesStatus();

    for (const outcome of OUTCOMES) {
      await user.click(outcomeRadio(outcome));

      assertNoCardCarriesStatus();
      expect(outcomeRadio(outcome).checked).toBe(true);
      for (const other of OUTCOMES) {
        if (other !== outcome) expect(outcomeRadio(other).checked).toBe(false);
      }
    }
  });

  it("blocks Continuer with no outcome, and focuses the first outcome radio", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    await user.click(screen.getByRole("button", { name: copy.visit.continue }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(copy.visit.outcomeRequired);
    expect(document.activeElement).toBe(outcomeRadio(OUTCOMES[0]));
    // Still on step 1.
    expect(screen.getByRole("button", { name: copy.visit.continue })).toBeTruthy();
  });

  it("wires the alert, every outcome hint and the flyer hint through aria after a blocked Continuer", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    await user.click(screen.getByRole("button", { name: copy.visit.continue }));
    const alert = await screen.findByRole("alert");

    const group = screen.getByRole("radiogroup", { name: copy.visit.outcome });
    expect(group.getAttribute("aria-describedby")).toBe(alert.id);

    for (const outcome of OUTCOMES) {
      const describedBy = outcomeRadio(outcome).getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy ?? "")?.textContent).toBe(OUTCOME_HINTS[outcome]);
    }

    const flyerCheckbox = screen.getByRole("checkbox", { name: new RegExp(copy.visit.flyerGiven) });
    const flyerDescribedBy = flyerCheckbox.getAttribute("aria-describedby");
    expect(flyerDescribedBy).toBeTruthy();
    expect(document.getElementById(flyerDescribedBy ?? "")?.textContent).toBe(copy.visit.flyerHint);
  });

  it("blocks Enregistrer la visite with no outcome and no script, and queues nothing", async () => {
    const user = userEvent.setup();
    await renderVisit({ expectContinue: false });

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    expect(await screen.findByText(copy.visit.outcomeRequired)).toBeTruthy();
    expect(document.activeElement).toBe(outcomeRadio(OUTCOMES[0]));
    expect(await fieldDb.outboxVisits.count()).toBe(0);
  });

  it("shows Relancer le only for À relancer, and drops it when the outcome changes", async () => {
    const user = userEvent.setup();
    await renderVisit({ expectContinue: false });

    await user.click(outcomeRadio("follow_up"));
    const date = screen.getByLabelText(copy.visit.followUpAt) as HTMLInputElement;
    expect(date.type).toBe("date");
    await user.type(date, "2026-10-01");

    await user.click(outcomeRadio("interested"));
    expect(screen.queryByLabelText(copy.visit.followUpAt)).toBeNull();

    // `withOutcome` dropped the value with the control: coming back starts empty.
    await user.click(outcomeRadio("follow_up"));
    expect((screen.getByLabelText(copy.visit.followUpAt) as HTMLInputElement).value).toBe("");
  });

  it("requires a follow-up date before Continuer, and focuses it when missing", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    await user.click(outcomeRadio("follow_up"));
    await user.click(screen.getByRole("button", { name: copy.visit.continue }));

    expect(await screen.findByText(copy.visit.followUpRequired)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(copy.visit.followUpAt));
    expect(screen.getByRole("button", { name: copy.visit.continue })).toBeTruthy();
  });

  it("focuses the first unanswered required question when step 2's save is blocked, and queues nothing", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    await user.click(outcomeRadio("interested"));
    await user.click(screen.getByRole("button", { name: copy.visit.continue }));
    await screen.findByText(copy.visit.step(2, 2, copy.visit.questions));

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    expect(await screen.findByText(copy.visit.answerRequired)).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById(questionDomId("delivery")));
    expect(await fieldDb.outboxVisits.count()).toBe(0);
  });

  it("renders step 1 offline, and still lets Continuer move to step 2", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    await fieldDb.visitHistory.add({
      id: "44444444-4444-4444-8444-444444444444",
      prospectId: PROSPECT.id,
      agentEmail: "agent@example.com",
      visitedAt: 1_700_000_000_000,
      flyerGiven: false,
      outcome: "no_contact",
      followUpAt: null,
      notes: "Fermé le lundi",
    });
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    // The history fetch (mocked to reject) is swallowed; what the last pull
    // cached still renders.
    expect(await screen.findByText("Fermé le lundi")).toBeTruthy();

    await user.click(outcomeRadio("interested"));
    await user.click(screen.getByRole("button", { name: copy.visit.continue }));

    expect(await screen.findByText(copy.visit.step(2, 2, copy.visit.questions))).toBeTruthy();
  });

  it("keeps the outcome, flyer and date intact when Résultat is tapped from step 2", async () => {
    await setMeta(fieldDb, "script", SCRIPT);
    const user = userEvent.setup();
    await renderVisit({ expectContinue: true });

    await user.click(screen.getByRole("checkbox", { name: new RegExp(copy.visit.flyerGiven) }));
    await user.click(outcomeRadio("follow_up"));
    await user.type(screen.getByLabelText(copy.visit.followUpAt), "2026-10-01");

    await user.click(screen.getByRole("button", { name: copy.visit.continue }));
    expect(await screen.findByText(copy.visit.step(2, 2, copy.visit.questions))).toBeTruthy();

    await user.click(screen.getByRole("button", { name: copy.visit.backToOutcome }));

    expect(screen.getByText(copy.visit.step(1, 2, copy.visit.outcome))).toBeTruthy();
    expect(outcomeRadio("follow_up").checked).toBe(true);
    expect((screen.getByLabelText(copy.visit.followUpAt) as HTMLInputElement).value).toBe(
      "2026-10-01",
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: new RegExp(copy.visit.flyerGiven),
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });
});

describe("VisitScreen — step 2 (Questions)", () => {
  it("yes/no: two equal tiles carrying the choice-selected utilities, only the tapped one checked", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const yes = screen.getByRole("radio", { name: copy.visit.yes }) as HTMLInputElement;
    const no = screen.getByRole("radio", { name: copy.visit.no }) as HTMLInputElement;
    const group = yes.closest('[role="radiogroup"]') as HTMLElement;
    expect(group.className).toContain("grid-cols-2");
    // The Personne sur place callout is for no_contact only: above required
    // questions it would tell the agent they may skip what save then blocks.
    expect(screen.queryByText(copy.visit.questionsOptional)).toBeNull();

    // The tile's gold fill is a `has-[:checked]:` utility (DESIGN.md
    // choice-selected) — present on both tiles, but a CSS-conditional class
    // that only paints while that tile's own input is checked. What a DOM
    // test can assert without a real stylesheet is that the utility is wired
    // on both tiles and that exactly one input ends up checked.
    const yesTile = yes.closest("label") as HTMLElement;
    const noTile = no.closest("label") as HTMLElement;
    for (const tile of [yesTile, noTile]) {
      expect(tile.className).toContain("has-[:checked]:bg-primary");
      expect(tile.className).toContain("has-[:checked]:border-primary-edge");
    }

    await user.click(yes);

    expect(yes.checked).toBe(true);
    expect(no.checked).toBe(false);
  });

  it("single choice: full-width rows, only the tapped option checked", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const paper = screen.getByRole("radio", { name: "Papier" }) as HTMLInputElement;
    const none = screen.getByRole("radio", { name: "Aucune" }) as HTMLInputElement;
    const paperTile = paper.closest("label") as HTMLElement;
    expect(paperTile.className).toContain("has-[:checked]:bg-primary");
    expect(paperTile.className).toContain("has-[:checked]:border-primary-edge");

    await user.click(paper);

    expect(paper.checked).toBe(true);
    expect(none.checked).toBe(false);
  });

  it("rating: five equal tiles, only 4 checked once tapped, answers 4", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const four = screen.getByRole("radio", { name: "4" }) as HTMLInputElement;
    const group = four.closest('[role="radiogroup"]') as HTMLElement;
    expect(group.className).toContain("grid-cols-5");
    const fourTile = four.closest("label") as HTMLElement;
    expect(fourTile.className).toContain("has-[:checked]:bg-primary");
    expect(fourTile.className).toContain("has-[:checked]:border-primary-edge");

    await user.click(four);

    expect(four.checked).toBe(true);
    for (const value of ["1", "2", "3", "5"]) {
      const other = screen.getByRole("radio", { name: value }) as HTMLInputElement;
      expect(other.checked).toBe(false);
    }
  });

  it("stepper +: three taps from empty read 3", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const plus = screen.getByRole("button", { name: copy.visit.stepUp });
    const input = screen.getByRole("spinbutton", {
      name: "Combien de places ?",
    }) as HTMLInputElement;

    await user.click(plus);
    await user.click(plus);
    await user.click(plus);

    expect(input.value).toBe("3");
  });

  it("stepper floor: − is disabled at 0, and a typed negative clamps to 0", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const minus = screen.getByRole("button", { name: copy.visit.stepDown }) as HTMLButtonElement;
    const input = screen.getByRole("spinbutton", {
      name: "Combien de places ?",
    }) as HTMLInputElement;

    await user.type(input, "0");
    expect(minus.disabled).toBe(true);

    await user.clear(input);
    await user.type(input, "-5");
    expect(input.value).toBe("0");
  });

  it("stepper −: disabled while empty, and steps 3 down to 2", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const minus = screen.getByRole("button", { name: copy.visit.stepDown }) as HTMLButtonElement;
    const input = screen.getByRole("spinbutton", {
      name: "Combien de places ?",
    }) as HTMLInputElement;
    // Empty is no answer; an enabled − would turn it into the answer 0.
    expect(minus.disabled).toBe(true);

    await user.type(input, "3");
    expect(minus.disabled).toBe(false);
    await user.click(minus);
    expect(input.value).toBe("2");
  });

  it("stepper: clearing the field leaves no answer, so save still asks for it", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const input = screen.getByRole("spinbutton", {
      name: "Combien de places ?",
    }) as HTMLInputElement;
    await user.type(input, "3");
    await user.clear(input);
    expect(input.value).toBe("");

    // The other three questions are answered, so a blocked save can only be
    // about the cleared one — proof that clearing produced no answer at all,
    // not zero (docs/design.md).
    await user.click(screen.getByRole("radio", { name: copy.visit.yes }));
    await user.click(screen.getByRole("radio", { name: "Papier" }));
    await user.click(screen.getByRole("radio", { name: "4" }));

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    expect(await screen.findByText(copy.visit.answerRequired)).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById(questionDomId("seats")));
    expect(await fieldDb.outboxVisits.count()).toBe(0);
  });

  it("stepper typed: typing 45 answers 45, and + increments to 46", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    const input = screen.getByRole("spinbutton", {
      name: "Combien de places ?",
    }) as HTMLInputElement;
    const plus = screen.getByRole("button", { name: copy.visit.stepUp });

    await user.type(input, "45");
    expect(input.value).toBe("45");

    await user.click(plus);
    expect(input.value).toBe("46");
  });

  it("save, one invalid: focuses and scrolls the first unanswered required question, and queues nothing", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    // delivery (1st) answered; cash_register (2nd) left empty on purpose.
    await user.click(screen.getByRole("radio", { name: copy.visit.yes }));
    await user.click(screen.getByRole("radio", { name: "4" }));
    await user.type(screen.getByRole("spinbutton", { name: "Combien de places ?" }), "5");

    const scrolled: Element[] = [];
    vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
      this: HTMLElement,
    ) {
      scrolled.push(this);
    });

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    expect(await screen.findByText(copy.visit.answerRequired)).toBeTruthy();
    const target = document.getElementById(questionDomId("cash_register"));
    expect(document.activeElement).toBe(target);
    expect(scrolled).toContain(target);
    expect(await fieldDb.outboxVisits.count()).toBe(0);
  });

  // #142: `save` once called `toVisit` without the pinned script and queued
  // `answers: {}` with `scriptId: null`.
  it("queues the visit with every answer and the script it was answered with", async () => {
    const user = userEvent.setup();
    await toStep2(user);

    await user.click(screen.getByRole("radio", { name: copy.visit.yes }));
    await user.click(screen.getByRole("radio", { name: "Papier" }));
    await user.click(screen.getByRole("radio", { name: "4" }));
    await user.type(screen.getByRole("spinbutton", { name: "Combien de places ?" }), "45");
    await user.click(screen.getByRole("button", { name: copy.visit.stepUp }));

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    await vi.waitFor(async () => expect(await fieldDb.outboxVisits.count()).toBe(1));
    const [visit] = await fieldDb.outboxVisits.toArray();
    expect(visit?.answers).toEqual({
      delivery: true,
      cash_register: "Papier",
      satisfaction: 4,
      seats: 46,
    });
    expect(visit?.scriptId).toBe(SCRIPT2.id);
  });

  it("personne sur place: shows the callout at the top of step 2, and saves with nothing answered", async () => {
    const user = userEvent.setup();
    await toStep2(user, "no_contact");

    const alert = screen.getByText(copy.visit.questionsOptional).closest('[role="note"]');
    if (!alert) throw new Error("no callout rendered");
    const heading = screen.getByText(copy.visit.questions);
    // The callout comes before the Questions heading in document order.
    expect(alert.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    expect(await fieldDb.outboxVisits.count()).toBe(1);
  });

  it("no script: Notes sits inline on the single step, and save queues the typed notes", async () => {
    const user = userEvent.setup();
    await renderVisit({ expectContinue: false });

    expect(screen.queryByText(/^Étape/)).toBeNull();

    await user.click(outcomeRadio("interested"));
    await user.type(screen.getByLabelText(copy.visit.notes), "Fermé le lundi");
    await user.click(screen.getByRole("button", { name: copy.visit.save }));

    const visits = await fieldDb.outboxVisits.toArray();
    expect(visits).toHaveLength(1);
    expect(visits[0]?.notes).toBe("Fermé le lundi");
  });
});
