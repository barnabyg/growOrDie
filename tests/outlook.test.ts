import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { foodBarLayout, foodOutlook } from "../src/outlook.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";
import type { PlayerPlan } from "../src/types.js";

const plan: PlayerPlan = {
  cultivatedHectares: 400,
  fertilizedHectares: 400,
  preparedHectares: 0,
  storeTons: 0,
};

describe("food outlook", () => {
  it("exposes the starting plan's food shortfall without changing the state", () => {
    const state = createNewGame(CONFIG);
    const original = structuredClone(state);
    const outlook = foodOutlook(
      state,
      { ...plan, fertilizedHectares: 0 },
      CONFIG,
    );
    expect(outlook.consumptionTons).toBe(1000);
    expect(outlook.ordinary.harvestTons).toBe(800);
    expect(outlook.ordinary.balanceTons).toBe(-200);
    expect(state).toEqual(original);
  });

  it("shows adverse scenarios and includes surviving food after a Flood", () => {
    const state = { ...createNewGame(CONFIG), storageTons: 2000 };
    const outlook = foodOutlook(state, plan, CONFIG);
    expect(outlook.ordinary.availableFoodTons).toBe(3600);
    expect(outlook.drought.harvestTons).toBe(800);
    expect(outlook.flood.storageTons).toBe(1500);
    expect(outlook.flood.harvestTons).toBe(960);
    expect(outlook.flood.balanceTons).toBe(1460);
  });

  it("ignores queued purchases and land preparation until the next Turn", () => {
    const state = createNewGame(CONFIG);
    const outlook = foodOutlook(
      state,
      {
        ...plan,
        preparedHectares: 100,
        purchaseTechnologies: ["irrigation", "highYieldSeeds"],
      },
      CONFIG,
    );
    expect(outlook.ordinary.harvestTons).toBe(1600);
    expect(outlook.drought.harvestTons).toBe(800);
  });

  it("matches actual food accounting under tuned rules and owned Technologies", () => {
    const config = {
      ...CONFIG,
      baseYieldPerHectare: 3,
      fertilizerYieldMultiplier: 1.75,
      highYieldSeedsYieldMultiplier: 1.3,
      irrigationDroughtLossMultiplier: 0.2,
      floodStorageLossFraction: 0.4,
    };
    const state = {
      ...createNewGame(config),
      budgetCoins: 20000,
      storageTons: 2000,
      ownedTechnologies: ["irrigation", "highYieldSeeds"] as const,
    };
    const game = { ...state, ownedTechnologies: [...state.ownedTechnologies] };
    const outlook = foodOutlook(game, plan, config);
    for (const event of ["ordinary", "drought", "flood"] as const) {
      const result = resolveTurn(game, plan, 1, {
        ...config,
        eventNothingProbability: event === "ordinary" ? 1 : 0,
        eventDroughtProbability: event === "drought" ? 1 : 0,
        eventFloodProbability: event === "flood" ? 1 : 0,
        eventPriceShockProbability: 0,
      });
      expect(outlook[event].harvestTons).toBe(result.report.harvestTons);
      expect(outlook[event].availableFoodTons).toBe(
        result.report.availableFoodTons,
      );
    }
  });
});

describe("food bar layout", () => {
  it("scales a surplus to available food with Consumption marked inside it", () => {
    const state = { ...createNewGame(CONFIG), storageTons: 400 };
    const bar = foodBarLayout(foodOutlook(state, plan, CONFIG));
    expect(bar).toEqual({
      harvestPercent: 80,
      storagePercent: 20,
      shortfallPercent: 0,
      consumptionPercent: 50,
    });
  });

  it("shades the gap up to the Consumption marker when food falls short", () => {
    const state = { ...createNewGame(CONFIG), storageTons: 100 };
    const bar = foodBarLayout(
      foodOutlook(state, { ...plan, fertilizedHectares: 0 }, CONFIG),
    );
    expect(bar).toEqual({
      harvestPercent: 80,
      storagePercent: 10,
      shortfallPercent: 10,
      consumptionPercent: 100,
    });
  });

  it("stays finite when there is no food and no Consumption", () => {
    const bar = foodBarLayout({
      consumptionTons: 0,
      ordinary: {
        harvestTons: 0,
        storageTons: 0,
        availableFoodTons: 0,
        balanceTons: 0,
      },
    });
    expect(bar).toEqual({
      harvestPercent: 0,
      storagePercent: 0,
      shortfallPercent: 0,
      consumptionPercent: 0,
    });
  });
});
