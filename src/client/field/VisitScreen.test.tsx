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
