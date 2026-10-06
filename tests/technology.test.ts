import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { technologyBenefit, technologyStatus } from "../src/technology.js";
import { TOLERANCE } from "../src/tolerance.js";

describe("Technology card benefit line", () => {
  it("describes each default Technology in one plain line", () => {
    expect(technologyBenefit("irrigation", CONFIG)).toBe(
      "50% less Yield lost to drought",
    );
    expect(technologyBenefit("highYieldSeeds", CONFIG)).toBe(
      "50% more food per hectare",
    );
    expect(technologyBenefit("granary", CONFIG)).toBe(
      "50% less Storage upkeep",
    );
    expect(technologyBenefit("tradeRoutes", CONFIG)).toBe(
      "20% more Export income per ton",
    );
    expect(technologyBenefit("landSurvey", CONFIG)).toBe(
      "50% less land preparation cost",
    );
    expect(technologyBenefit("fertilizerWorks", CONFIG)).toBe(
      "50% less fertilizer cost",
    );
  });

  it("follows tuned configuration rather than fixed copy", () => {
    const tuned = {
      ...CONFIG,
      irrigationDroughtLossMultiplier: 0.2,
      highYieldSeedsYieldMultiplier: 1.3,
      granaryUpkeepMultiplier: 0.7,
      tradeRoutesPriceMultiplier: 1.1,
      landSurveyCostMultiplier: 0.4,
      fertilizerWorksCostMultiplier: 1.25,
    };
    expect(technologyBenefit("irrigation", tuned)).toBe(
      "80% less Yield lost to drought",
    );
    expect(technologyBenefit("highYieldSeeds", tuned)).toBe(
      "30% more food per hectare",
    );
    expect(technologyBenefit("granary", tuned)).toBe("30% less Storage upkeep");
    expect(technologyBenefit("tradeRoutes", tuned)).toBe(
      "10% more Export income per ton",
    );
    expect(technologyBenefit("landSurvey", tuned)).toBe(
      "60% less land preparation cost",
    );
    expect(technologyBenefit("fertilizerWorks", tuned)).toBe(
      "25% more fertilizer cost",
    );
  });

  it("states a neutral multiplier as no change", () => {
    expect(
      technologyBenefit("granary", { ...CONFIG, granaryUpkeepMultiplier: 1 }),
    ).toBe("No change to Storage upkeep");
  });
});

describe("Technology card status", () => {
  it("shows nothing for an affordable, unselected Technology", () => {
    expect(
      technologyStatus({ owned: false, selected: false, shortfall: 0 }),
    ).toEqual({ kind: "available", text: "" });
    expect(
      technologyStatus({ owned: false, selected: false, shortfall: -500 }),
    ).toEqual({ kind: "available", text: "" });
  });

  it("names Owned, Selected and unaffordable states", () => {
    expect(
      technologyStatus({ owned: true, selected: true, shortfall: 900 }),
    ).toEqual({ kind: "owned", text: "Owned" });
    expect(
      technologyStatus({ owned: false, selected: true, shortfall: 900 }),
    ).toEqual({ kind: "selected", text: "Selected" });
    expect(
      technologyStatus({ owned: false, selected: false, shortfall: 1500.5 }),
    ).toEqual({ kind: "unaffordable", text: "Need 1,500.5 coins more" });
    expect(
      technologyStatus({ owned: false, selected: false, shortfall: 1 }),
    ).toEqual({ kind: "unaffordable", text: "Need 1 coin more" });
  });

  it("ignores floating-point dust when the Budget exactly covers the cost", () => {
    expect(
      technologyStatus({ owned: false, selected: false, shortfall: 1e-10 }),
    ).toEqual({ kind: "available", text: "" });
  });
});

describe("Technology affordability tolerance", () => {
  it("treats floating-point noise within the shared tolerance as affordable", () => {
    const status = (shortfall: number) =>
      technologyStatus({ owned: false, selected: false, shortfall }).kind;
    expect(status(TOLERANCE / 2)).toBe("available");
    expect(status(TOLERANCE * 2)).toBe("unaffordable");
  });
});
