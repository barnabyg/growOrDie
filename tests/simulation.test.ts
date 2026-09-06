import { describe, it, expect } from "vitest";
import { createNewGame, resolveTurn } from "../src/simulation.js";
import { CONFIG } from "../src/config.js";
import type { GameState } from "../src/types.js";

function baselineState(overrides: Partial<GameState> = {}): GameState {
  return {
    year: 1,
    population: 1_000,
    arableLandHectares: 2_000,
    preparedLandHectares: 400,
    storageTons: 0,
    budgetCoins: 4_000,
    worldPrice: 10,
    ...overrides,
  };
}

describe("createNewGame", () => {
  it("starts a run from the spec baseline", () => {
    const state = createNewGame(CONFIG);
    expect(state).toEqual({
      year: 1,
      population: 1_000,
      arableLandHectares: 2_000,
      preparedLandHectares: 400,
      storageTons: 0,
      budgetCoins: CONFIG.taxPerPerson * CONFIG.startingPopulation,
      worldPrice: CONFIG.worldPriceBase,
    });
  });
});

describe("resolveTurn", () => {
  it("resolves the deliberately food-short Year 1 at full cultivation", () => {
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400 }, 12345, CONFIG);

    // Harvest at base Yield: 400 ha x 2 t/ha = 800 t against 1_000 t Consumption.
    expect(result.report.harvestTons).toBe(800);
    expect(result.report.consumptionTons).toBe(1_000);
    expect(result.report.famine).toBe("partial");

    // Famine: population shrinks in proportion to the food shortfall (20%).
    expect(result.state.population).toBe(800);

    // No surplus left to store.
    expect(result.state.storageTons).toBe(0);

    // Next-turn Budget: tax on the new population + unspent carry-over.
    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    const carryOver = 4_000 - seeds; // 3_200
    const tax = result.state.population * CONFIG.taxPerPerson; // 3_200
    expect(result.state.budgetCoins).toBe(tax + carryOver);

    expect(result.state.year).toBe(2);
    expect(result.report.budgetSpentCoins).toBe(seeds);
    expect(result.report.seedCostCoins).toBe(seeds);
    expect(result.report.storageUpkeepCoins).toBe(0);
    expect(result.report.budgetRevenueCoins).toBe(tax);
    expect(result.report.budgetCarryOverCoins).toBe(carryOver);
  });

  it("grows the population by the growth rate when Consumption is met", () => {
    // Opening storage of 200 t covers the shortfall: available 1_000 = consumption.
    const result = resolveTurn(
      baselineState({ storageTons: 200 }),
      { cultivatedHectares: 400 },
      1,
      CONFIG,
    );

    expect(result.report.famine).toBe("none");
    expect(result.state.population).toBe(Math.round(1_000 * (1 + CONFIG.populationGrowthRate))); // 1_050

    // Surplus (available - consumption) stays in Storage and pays upkeep.
    const storageEnd = 800 + 200 - 1_000; // 0
    expect(result.state.storageTons).toBe(storageEnd);

    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    const upkeep = storageEnd * CONFIG.storageUpkeepPerTonPerYear; // 0
    const carryOver = 4_000 - seeds - upkeep;
    expect(result.state.budgetCoins).toBe(
      result.state.population * CONFIG.taxPerPerson + carryOver,
    );
  });

  it("lets surplus food roll into Storage when the harvest exceeds Consumption", () => {
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400 }, 7, CONFIG);
    // 800 t harvest < 1_000 t consumption -> famine; nothing stored.
    expect(result.state.storageTons).toBe(0);

    const bountiful = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400 },
      7,
      CONFIG,
    );
    // available 1_200 - consumption 1_000 = 200 t stored.
    expect(bountiful.report.famine).toBe("none");
    expect(bountiful.state.storageTons).toBe(200);
    const upkeep = 200 * CONFIG.storageUpkeepPerTonPerYear;
    const carryOver = 4_000 - 800 - upkeep;
    expect(bountiful.state.budgetCoins).toBe(
      bountiful.state.population * CONFIG.taxPerPerson + carryOver,
    );
  });

  it("collapses the population to zero on a total Famine", () => {
    const result = resolveTurn(baselineState(), { cultivatedHectares: 0 }, 99, CONFIG);

    expect(result.report.harvestTons).toBe(0);
    expect(result.report.famine).toBe("total");
    expect(result.state.population).toBe(0);
    // No spending, no tax base: the whole Budget carries over.
    expect(result.state.budgetCoins).toBe(4_000);
  });

  it("shrinks the population by the exact shortfall percentage in a partial Famine", () => {
    // Cultivate 250 ha: harvest 500 t, consumption 1_000 t -> 50% shortfall.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 250 }, 3, CONFIG);
    expect(result.state.population).toBe(500);
  });

  it("clamps the plan to the prepared land and floors fractional hectares", () => {
    const over = resolveTurn(baselineState(), { cultivatedHectares: 9_999 }, 1, CONFIG);
    expect(over.report.harvestTons).toBe(400 * CONFIG.baseYieldPerHectare);

    const negative = resolveTurn(baselineState(), { cultivatedHectares: -50 }, 1, CONFIG);
    expect(negative.report.harvestTons).toBe(0);

    const fractional = resolveTurn(baselineState(), { cultivatedHectares: 123.9 }, 1, CONFIG);
    expect(fractional.report.harvestTons).toBe(123 * CONFIG.baseYieldPerHectare);
  });

  it("is deterministic: same state + plan + seed produces the same result", () => {
    const state = baselineState();
    const first = resolveTurn(state, { cultivatedHectares: 300 }, 42, CONFIG);
    const second = resolveTurn(state, { cultivatedHectares: 300 }, 42, CONFIG);
    expect(second).toEqual(first);
  });

  it("obeys the config block: tuning base Yield changes behaviour without touching sim logic", () => {
    const highYield = { ...CONFIG, baseYieldPerHectare: 3 };
    // 400 ha x 3 t/ha = 1_200 t >= 1_000 t consumption -> no Famine.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400 }, 5, highYield);
    expect(result.report.famine).toBe("none");
    expect(result.state.storageTons).toBe(200);
  });
});
