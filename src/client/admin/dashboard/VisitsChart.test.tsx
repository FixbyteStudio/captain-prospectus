/**
 * Visites dans le temps' two drawing rules — GH #110, docs/design.md › Tableau de bord:
 * the in-segment count, and the 1px card stroke between neighbours.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { BarShapeProps } from "recharts";
import type { Outcome } from "../../../shared/constants";
import { hasNeighbourAbove, segment, showsCount } from "./VisitsChart";

const counts = (over: Partial<Record<Outcome, number>> = {}) => ({
  no_contact: 0,
  interested: 0,
  not_interested: 0,
  follow_up: 0,
  converted: 0,
  ...over,
});

describe("showsCount (I/O matrix, label)", () => {
  it.each([
    [40, 22, 7, true],
    [40, 21, 7, false],
    // A 90-day bar: tall enough, too narrow for its digits (GH #110 decision).
    [5, 22, 7, false],
    [14, 22, 7, true],
    [13, 40, 7, false],
    // The floor grows with the digits: 18 px for two, 25 px for three.
    [17, 40, 10, false],
    [18, 40, 10, true],
    [24, 40, 100, false],
    [25, 40, 100, true],
  ])("a %i × %i px segment prints %i: %s", (width, height, count, shown) => {
    expect(showsCount(width, height, count)).toBe(shown);
  });
});

describe("hasNeighbourAbove", () => {
  it("strokes a segment's top only under a drawn segment", () => {
    const day = counts({ no_contact: 2, not_interested: 1, converted: 3 });
    expect(hasNeighbourAbove(day, "no_contact")).toBe(true);
    // interested is 0: not drawn, so no stroke.
    expect(hasNeighbourAbove(day, "interested")).toBe(false);
    expect(hasNeighbourAbove(day, "not_interested")).toBe(true);
    // The topmost drawn segment has no neighbour above.
    expect(hasNeighbourAbove(day, "converted")).toBe(false);
    expect(hasNeighbourAbove(counts({ interested: 4 }), "interested")).toBe(false);
  });
});

describe("segment", () => {
  function draw(outcome: Outcome, width: number, height: number, row = counts()) {
    const Shape = segment(outcome);
    const props = { x: 10, y: 20, width, height, fill: "red", payload: row } as BarShapeProps;
    return render(<svg>{Shape(props)}</svg>).container;
  }

  it("draws the fill, the separator on its top edge, and the count in its middle", () => {
    const svg = draw("no_contact", 40, 30, counts({ no_contact: 7, converted: 1 }));
    expect(svg.querySelector("rect")?.getAttribute("height")).toBe("30");
    const line = svg.querySelector("line");
    expect(line?.getAttribute("y1")).toBe("20.5");
    expect(line?.getAttribute("x2")).toBe("50");
    expect(line?.classList.contains("stroke-card")).toBe(true);
    const text = svg.querySelector("text");
    expect(text?.textContent).toBe("7");
    expect(text?.getAttribute("y")).toBe("35");
    // Navy in light, the dark ink in dark: one token does both on no-contact.
    expect(text?.classList.contains("fill-primary-foreground")).toBe(true);
  });

  it.each(["interested", "not_interested", "follow_up", "converted"] as const)(
    "inks %s card in light and primary-foreground in dark",
    (outcome) => {
      const text = draw(outcome, 40, 30, counts({ [outcome]: 5 })).querySelector("text");
      expect(text?.classList.contains("fill-card")).toBe(true);
      expect(text?.classList.contains("dark:fill-primary-foreground")).toBe(true);
    },
  );

  it("leaves a short segment's count to the tooltip and the table, and draws nothing at 0", () => {
    expect(draw("converted", 40, 21, counts({ converted: 1 })).querySelector("text")).toBeNull();
    expect(draw("converted", 40, 0).querySelector("rect")).toBeNull();
  });
});
