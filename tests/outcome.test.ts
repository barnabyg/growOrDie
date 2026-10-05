import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { outcomeHeadline, populationChange } from "../src/outcome.js";
import { newSave } from "../src/persistence.js";
import { beginTurn } from "../src/turn.js";

const fed = {
  famine: "none" as const,
  populationStart: 1000,
  populationEnd: 1050,
  consumptionTons: 1000,
  availableFoodTons: 1600,
};

describe("outcome headline", () => {
  it("leads with the Population change when everyone is fed", () => {
    expect(outcomeHeadline(fed)).toEqual({
      lead: "+50 people",
      context: "No famine",
      famine: false,
    });
  });

  it("uses the singular and handles no change", () => {
    expect(outcomeHeadline({ ...fed, populationEnd: 1001 }).lead).toBe(
      "+1 person",
    );
    expect(outcomeHeadline({ ...fed, populationEnd: 1000 }).lead).toBe(
      "+0 people",
    );
  });

  it("leads with the shortfall in tons during Famine", () => {
    expect(
      outcomeHeadline({
        famine: "partial",
        populationStart: 1000,
        populationEnd: 900,
        consumptionTons: 1000,
        availableFoodTons: 800,
      }),
    ).toEqual({
      lead: "200 t shortfall",
      context: "Partial famine",
      famine: true,
    });
  });

  it("states a Total famine as the whole Consumption missing", () => {
    expect(
      outcomeHeadline({
        famine: "total",
        populationStart: 1000,
        populationEnd: 0,
        consumptionTons: 1000,
        availableFoodTons: 0,
      }),
    ).toEqual({
      lead: "1,000 t shortfall",
      context: "Total famine",
      famine: true,
    });
  });

  it("agrees with a resolved Harvest", () => {
    const state = newSave(5).state;
    const plan = {
      cultivatedHectares: 300,
      fertilizedHectares: 0,
      preparedHectares: 0,
      storeTons: 0,
      purchaseTechnologies: [],
    };
    const { report } = beginTurn(state, plan, 6, CONFIG).result;
    expect(report.famine).toBe("partial");
    expect(outcomeHeadline(report).lead).toBe(
      `${report.consumptionTons - report.availableFoodTons} t shortfall`,
    );
  });
});

describe("Population change", () => {
  it("shows start, end and signed change", () => {
    expect(populationChange(fed)).toBe("1,000 → 1,050 (+50)");
    expect(
      populationChange({ populationStart: 1000, populationEnd: 880 }),
    ).toBe("1,000 → 880 (-120)");
  });
});
