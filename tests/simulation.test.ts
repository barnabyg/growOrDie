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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0 }, 12345, CONFIG);

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
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0 },
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0 }, 7, CONFIG);
    // 800 t harvest < 1_000 t consumption -> famine; nothing stored.
    expect(result.state.storageTons).toBe(0);

    const bountiful = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0 },
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 0, fertilizedHectares: 0, preparedHectares: 0 }, 99, CONFIG);

    expect(result.report.harvestTons).toBe(0);
    expect(result.report.famine).toBe("total");
    expect(result.state.population).toBe(0);
    // No spending, no tax base: the whole Budget carries over.
    expect(result.state.budgetCoins).toBe(4_000);
  });

  it("shrinks the population by the exact shortfall percentage in a partial Famine", () => {
    // Cultivate 250 ha: harvest 500 t, consumption 1_000 t -> 50% shortfall.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 250, fertilizedHectares: 0, preparedHectares: 0 }, 3, CONFIG);
    expect(result.state.population).toBe(500);
  });

  it("clamps the plan to the prepared land and floors fractional hectares", () => {
    const over = resolveTurn(baselineState(), { cultivatedHectares: 9_999, fertilizedHectares: 0, preparedHectares: 0 }, 1, CONFIG);
    expect(over.report.harvestTons).toBe(400 * CONFIG.baseYieldPerHectare);

    const negative = resolveTurn(baselineState(), { cultivatedHectares: -50, fertilizedHectares: 0, preparedHectares: 0 }, 1, CONFIG);
    expect(negative.report.harvestTons).toBe(0);

    const fractional = resolveTurn(baselineState(), { cultivatedHectares: 123.9, fertilizedHectares: 0, preparedHectares: 0 }, 1, CONFIG);
    expect(fractional.report.harvestTons).toBe(123 * CONFIG.baseYieldPerHectare);
  });

  it("is deterministic: same state + plan + seed produces the same result", () => {
    const state = baselineState();
    const first = resolveTurn(state, { cultivatedHectares: 300, fertilizedHectares: 0, preparedHectares: 0 }, 42, CONFIG);
    const second = resolveTurn(state, { cultivatedHectares: 300, fertilizedHectares: 0, preparedHectares: 0 }, 42, CONFIG);
    expect(second).toEqual(first);
  });

  it("obeys the config block: tuning base Yield changes behaviour without touching sim logic", () => {
    const highYield = { ...CONFIG, baseYieldPerHectare: 3 };
    // 400 ha x 3 t/ha = 1_200 t >= 1_000 t consumption -> no Famine.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0 }, 5, highYield);
    expect(result.report.famine).toBe("none");
    expect(result.state.storageTons).toBe(200);
  });
});

describe("resolveTurn — fertilizer", () => {
  it("doubles Yield on fertilized hectares and charges the per-hectare cost", () => {
    const result = resolveTurn(
      baselineState(),
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 0 },
      11,
      CONFIG,
    );

    // 200 ha at base Yield (400 t) + 200 ha doubled (800 t) = 1_200 t.
    expect(result.report.harvestTons).toBe(1_200);
    expect(result.report.famine).toBe("none");

    const fertilizer = 200 * CONFIG.fertilizerCostPerHectare; // 600
    expect(result.report.fertilizerCostCoins).toBe(fertilizer);

    // All spending lines hit this Turn's Budget: seeds + fertilizer + upkeep.
    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    const surplus = 1_200 - 1_000; // 200 t stored
    const upkeep = surplus * CONFIG.storageUpkeepPerTonPerYear; // 200
    expect(result.report.budgetSpentCoins).toBe(seeds + fertilizer + upkeep);
    expect(result.report.budgetCarryOverCoins).toBe(4_000 - seeds - fertilizer - upkeep);
  });

  it("clamps fertilized hectares to the cultivated area and floors fractions", () => {
    const over = resolveTurn(
      baselineState(),
      { cultivatedHectares: 100, fertilizedHectares: 9_999, preparedHectares: 0 },
      2,
      CONFIG,
    );
    // All 100 ha doubled.
    expect(over.report.harvestTons).toBe(100 * CONFIG.baseYieldPerHectare * CONFIG.fertilizerYieldMultiplier);
    expect(over.report.fertilizerCostCoins).toBe(100 * CONFIG.fertilizerCostPerHectare);

    const fractional = resolveTurn(
      baselineState(),
      { cultivatedHectares: 50, fertilizedHectares: 12.9, preparedHectares: 0 },
      3,
      CONFIG,
    );
    expect(fractional.report.harvestTons).toBe(
      38 * CONFIG.baseYieldPerHectare + 12 * CONFIG.baseYieldPerHectare * CONFIG.fertilizerYieldMultiplier,
    );

    const negative = resolveTurn(
      baselineState(),
      { cultivatedHectares: 50, fertilizedHectares: -4, preparedHectares: 0 },
      4,
      CONFIG,
    );
    expect(negative.report.harvestTons).toBe(50 * CONFIG.baseYieldPerHectare);
    expect(negative.report.fertilizerCostCoins).toBe(0);
  });
});

describe("resolveTurn — land preparation", () => {
  it("charges the one-off prep cost and makes new land cultivable from the next Turn", () => {
    const result = resolveTurn(
      baselineState({ budgetCoins: 10_000 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 50 },
      21,
      CONFIG,
    );

    const prep = 50 * CONFIG.landPrepCostPerHectare; // 3_000
    expect(result.report.landPrepCostCoins).toBe(prep);

    // This Turn's cultivation was clamped to the prepared land BEFORE the new prep...
    expect(result.report.harvestTons).toBe(400 * CONFIG.baseYieldPerHectare);
    // ...but the next Turn starts with the extra 50 ha prepared.
    expect(result.state.preparedLandHectares).toBe(450);
    expect(result.state.arableLandHectares).toBe(2_000);

    // Prep hits this Turn's Budget: seeds + prep + upkeep (no surplus: 800 t < 1_000 t).
    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    expect(result.report.budgetSpentCoins).toBe(seeds + prep);
    expect(result.report.budgetCarryOverCoins).toBe(10_000 - seeds - prep);
  });

  it("clamps preparation to the remaining Arable land and floors fractions", () => {
    const over = resolveTurn(
      baselineState({ budgetCoins: 20_000, arableLandHectares: 500 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 9_999 },
      22,
      CONFIG,
    );
    // Only 100 ha of Arable land remain unprepared.
    expect(over.report.landPrepCostCoins).toBe(100 * CONFIG.landPrepCostPerHectare);
    expect(over.state.preparedLandHectares).toBe(500);

    const fractional = resolveTurn(
      baselineState({ budgetCoins: 20_000 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 12.9 },
      23,
      CONFIG,
    );
    expect(fractional.report.landPrepCostCoins).toBe(12 * CONFIG.landPrepCostPerHectare);
    expect(fractional.state.preparedLandHectares).toBe(412);

    const negative = resolveTurn(
      baselineState(),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: -7 },
      24,
      CONFIG,
    );
    expect(negative.report.landPrepCostCoins).toBe(0);
    expect(negative.state.preparedLandHectares).toBe(400);
  });
});

describe("resolveTurn — budget across all spending lines", () => {
  it("charges seeds, fertilizer, and land prep from this Turn's Budget and carries the rest over", () => {
    const result = resolveTurn(
      baselineState({ budgetCoins: 10_000 }),
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 50 },
      31,
      CONFIG,
    );

    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    const fertilizer = 200 * CONFIG.fertilizerCostPerHectare; // 600
    const prep = 50 * CONFIG.landPrepCostPerHectare; // 3_000
    expect(result.report.seedCostCoins).toBe(seeds);
    expect(result.report.fertilizerCostCoins).toBe(fertilizer);
    expect(result.report.landPrepCostCoins).toBe(prep);

    // Fertilized harvest (1_200 t) covers consumption: 200 t stored, upkeep charged.
    const upkeep = 200 * CONFIG.storageUpkeepPerTonPerYear; // 200
    expect(result.report.budgetSpentCoins).toBe(seeds + fertilizer + prep + upkeep);
    expect(result.report.budgetCarryOverCoins).toBe(10_000 - seeds - fertilizer - prep - upkeep);

    // Next-turn Budget = tax on the grown population + unspent carry-over.
    const tax = result.state.population * CONFIG.taxPerPerson;
    expect(result.state.budgetCoins).toBe(tax + result.report.budgetCarryOverCoins);
  });
});

describe("resolveTurn — config-driven tuning", () => {
  it("obeys the config block: tuning fertilizer and land-prep values changes behaviour", () => {
    const tuned = {
      ...CONFIG,
      fertilizerCostPerHectare: 5,
      fertilizerYieldMultiplier: 3,
      landPrepCostPerHectare: 100,
    };
    const result = resolveTurn(
      baselineState({ budgetCoins: 10_000 }),
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 10 },
      8,
      tuned,
    );

    // 200 ha at base Yield (400 t) + 200 ha tripled (1_200 t) = 1_600 t.
    expect(result.report.harvestTons).toBe(1_600);
    expect(result.report.fertilizerCostCoins).toBe(200 * tuned.fertilizerCostPerHectare); // 1_000
    expect(result.report.landPrepCostCoins).toBe(10 * tuned.landPrepCostPerHectare); // 1_000
  });
});
