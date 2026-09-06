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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);

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
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 },
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 7, CONFIG);
    // 800 t harvest < 1_000 t consumption -> famine; nothing stored.
    expect(result.state.storageTons).toBe(0);

    const bountiful = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 200 },
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 0, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 99, CONFIG);

    expect(result.report.harvestTons).toBe(0);
    expect(result.report.famine).toBe("total");
    expect(result.state.population).toBe(0);
    // No spending, no tax base: the whole Budget carries over.
    expect(result.state.budgetCoins).toBe(4_000);
  });

  it("shrinks the population by the exact shortfall percentage in a partial Famine", () => {
    // Cultivate 250 ha: harvest 500 t, consumption 1_000 t -> 50% shortfall.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 250, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 3, CONFIG);
    expect(result.state.population).toBe(500);
  });

  it("clamps the plan to the prepared land and floors fractional hectares", () => {
    const over = resolveTurn(baselineState(), { cultivatedHectares: 9_999, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(over.report.harvestTons).toBe(400 * CONFIG.baseYieldPerHectare);

    const negative = resolveTurn(baselineState(), { cultivatedHectares: -50, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(negative.report.harvestTons).toBe(0);

    const fractional = resolveTurn(baselineState(), { cultivatedHectares: 123.9, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(fractional.report.harvestTons).toBe(123 * CONFIG.baseYieldPerHectare);
  });

  it("is deterministic: same state + plan + seed produces the same result", () => {
    const state = baselineState();
    const first = resolveTurn(state, { cultivatedHectares: 300, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 42, CONFIG);
    const second = resolveTurn(state, { cultivatedHectares: 300, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 42, CONFIG);
    expect(second).toEqual(first);
  });

  it("obeys the config block: tuning base Yield changes behaviour without touching sim logic", () => {
    const highYield = { ...CONFIG, baseYieldPerHectare: 3 };
    // 400 ha x 3 t/ha = 1_200 t >= 1_000 t consumption -> no Famine.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 200 }, 5, highYield);
    expect(result.report.famine).toBe("none");
    expect(result.state.storageTons).toBe(200);
  });
});

describe("resolveTurn — fertilizer", () => {
  it("doubles Yield on fertilized hectares and charges the per-hectare cost", () => {
    const result = resolveTurn(
      baselineState(),
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 0, storeTons: 200 },
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
      { cultivatedHectares: 100, fertilizedHectares: 9_999, preparedHectares: 0, storeTons: 0 },
      2,
      CONFIG,
    );
    // All 100 ha doubled.
    expect(over.report.harvestTons).toBe(100 * CONFIG.baseYieldPerHectare * CONFIG.fertilizerYieldMultiplier);
    expect(over.report.fertilizerCostCoins).toBe(100 * CONFIG.fertilizerCostPerHectare);

    const fractional = resolveTurn(
      baselineState(),
      { cultivatedHectares: 50, fertilizedHectares: 12.9, preparedHectares: 0, storeTons: 0 },
      3,
      CONFIG,
    );
    expect(fractional.report.harvestTons).toBe(
      38 * CONFIG.baseYieldPerHectare + 12 * CONFIG.baseYieldPerHectare * CONFIG.fertilizerYieldMultiplier,
    );

    const negative = resolveTurn(
      baselineState(),
      { cultivatedHectares: 50, fertilizedHectares: -4, preparedHectares: 0, storeTons: 0 },
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
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 50, storeTons: 0 },
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
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 9_999, storeTons: 0 },
      22,
      CONFIG,
    );
    // Only 100 ha of Arable land remain unprepared.
    expect(over.report.landPrepCostCoins).toBe(100 * CONFIG.landPrepCostPerHectare);
    expect(over.state.preparedLandHectares).toBe(500);

    const fractional = resolveTurn(
      baselineState({ budgetCoins: 20_000 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 12.9, storeTons: 0 },
      23,
      CONFIG,
    );
    expect(fractional.report.landPrepCostCoins).toBe(12 * CONFIG.landPrepCostPerHectare);
    expect(fractional.state.preparedLandHectares).toBe(412);

    const negative = resolveTurn(
      baselineState(),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: -7, storeTons: 0 },
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
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 50, storeTons: 200 },
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
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 10, storeTons: 300 },
      8,
      tuned,
    );

    // 200 ha at base Yield (400 t) + 200 ha tripled (1_200 t) = 1_600 t.
    expect(result.report.harvestTons).toBe(1_600);
    expect(result.report.fertilizerCostCoins).toBe(200 * tuned.fertilizerCostPerHectare); // 1_000
    expect(result.report.landPrepCostCoins).toBe(10 * tuned.landPrepCostPerHectare); // 1_000
  });
});

describe("resolveTurn — storage & trade", () => {
  const faminePlan = { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 };

  it("walks the World price by at most the step size, clamped to [min, max], for every seed", () => {
    for (let seed = 0; seed < 200; seed++) {
      const result = resolveTurn(baselineState(), faminePlan, seed, CONFIG);
      expect(result.state.worldPrice).toBeGreaterThanOrEqual(CONFIG.worldPriceMin);
      expect(result.state.worldPrice).toBeLessThanOrEqual(CONFIG.worldPriceMax);
      expect(Math.abs(result.state.worldPrice - CONFIG.worldPriceBase)).toBeLessThanOrEqual(
        CONFIG.worldPriceWalkStep + 1e-9,
      );
    }
  });

  it("is deterministic under the seeded RNG for the World price walk", () => {
    const state = baselineState();
    const first = resolveTurn(state, faminePlan, 42, CONFIG);
    const second = resolveTurn(state, faminePlan, 42, CONFIG);
    expect(second.state.worldPrice).toBe(first.state.worldPrice);
  });

  it("obeys the config block: tuning the walk step and bounds changes behaviour", () => {
    const frozen = { ...CONFIG, worldPriceWalkStep: 0 };
    for (let seed = 0; seed < 20; seed++) {
      expect(resolveTurn(baselineState(), faminePlan, seed, frozen).state.worldPrice).toBe(CONFIG.worldPriceBase);
    }

    const pinned = { ...CONFIG, worldPriceMin: 5, worldPriceMax: 5 };
    for (let seed = 0; seed < 20; seed++) {
      expect(resolveTurn(baselineState(), faminePlan, seed, pinned).state.worldPrice).toBe(5);
    }
  });

  it("clamps storeTons into [minimum re-store, Surplus]", () => {
    // Opening storage 400 + harvest 800 = available 1_200 -> Surplus 200 t.
    const over = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 9_999 },
      1,
      CONFIG,
    );
    expect(over.state.storageTons).toBe(200);
    expect(over.report.exportTons).toBe(0);

    const negative = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: -50 },
      1,
      CONFIG,
    );
    expect(negative.state.storageTons).toBe(0);
    expect(negative.report.exportTons).toBe(200);

    // Opening storage alone covers Consumption: at least (storage - consumption) must be re-stored.
    const minStore = resolveTurn(
      baselineState({ storageTons: 1_200 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 },
      1,
      CONFIG,
    );
    expect(minStore.state.storageTons).toBe(200);
    expect(minStore.report.exportTons).toBe(800);
  });

  it("auto-exports the un-stored Surplus at the current World price and refills next Budget with the income", () => {
    // Fertilized harvest 1_200 t -> Surplus 200 t; store 100, export 100 at 10 coins/t.
    const result = resolveTurn(
      baselineState(),
      { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 0, storeTons: 100 },
      13,
      CONFIG,
    );

    expect(result.report.exportTons).toBe(100);
    expect(result.report.exportIncomeCoins).toBe(1_000);

    const tax = result.state.population * CONFIG.taxPerPerson; // 1_050 x 4 = 4_200
    expect(result.report.budgetRevenueCoins).toBe(tax + 1_000);

    const seeds = 400 * CONFIG.seedCostPerHectare; // 800
    const fertilizer = 200 * CONFIG.fertilizerCostPerHectare; // 600
    const upkeep = 100 * CONFIG.storageUpkeepPerTonPerYear; // 100
    const carryOver = 4_000 - seeds - fertilizer - upkeep; // 2_500
    expect(result.state.budgetCoins).toBe(tax + 1_000 + carryOver);
  });

  it("charges storage upkeep on the player's chosen storage, not the auto-stored maximum", () => {
    const storeHalf = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 100 },
      17,
      CONFIG,
    );
    expect(storeHalf.state.storageTons).toBe(100);
    expect(storeHalf.report.storageUpkeepCoins).toBe(100 * CONFIG.storageUpkeepPerTonPerYear);

    const storeAll = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 200 },
      17,
      CONFIG,
    );
    expect(storeAll.state.storageTons).toBe(200);
    expect(storeAll.report.storageUpkeepCoins).toBe(200 * CONFIG.storageUpkeepPerTonPerYear);
  });

  it("stores and exports nothing on a Famine turn", () => {
    const result = resolveTurn(
      baselineState(),
      { cultivatedHectares: 0, fertilizedHectares: 0, preparedHectares: 0, storeTons: 9_999 },
      19,
      CONFIG,
    );
    expect(result.report.famine).toBe("total");
    expect(result.state.storageTons).toBe(0);
    expect(result.report.exportTons).toBe(0);
    expect(result.report.exportIncomeCoins).toBe(0);
  });
});
