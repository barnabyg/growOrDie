import { describe, it, expect } from "vitest";
import { createNewGame, eventSummary, resolveTurn } from "../src/simulation.js";
import { CONFIG } from "../src/config.js";
import type { GameState, PlayerPlan } from "../src/types.js";

function baselineState(overrides: Partial<GameState> = {}): GameState {
  return {
    year: 1,
    population: 1_000,
    arableLandHectares: 2_000,
    preparedLandHectares: 400,
    storageTons: 0,
    budgetCoins: 4_000,
    worldPrice: 10,
    ownedTechnologies: [],
    highestPopulation: 1_000,
    collapsed: false,
    collapseCause: null,
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
      ownedTechnologies: [],
      highestPopulation: CONFIG.startingPopulation,
      collapsed: false,
      collapseCause: null,
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
      6,
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 250, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 10, CONFIG);
    expect(result.state.population).toBe(500);
  });

  it("clamps the plan to the prepared land and floors fractional hectares", () => {
    const over = resolveTurn(baselineState(), { cultivatedHectares: 9_999, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12, CONFIG);
    expect(over.report.harvestTons).toBe(400 * CONFIG.baseYieldPerHectare);

    const negative = resolveTurn(baselineState(), { cultivatedHectares: -50, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12, CONFIG);
    expect(negative.report.harvestTons).toBe(0);

    const fractional = resolveTurn(baselineState(), { cultivatedHectares: 123.9, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12, CONFIG);
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
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 200 }, 14, highYield);
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
      15,
      CONFIG,
    );
    // All 100 ha doubled.
    expect(over.report.harvestTons).toBe(100 * CONFIG.baseYieldPerHectare * CONFIG.fertilizerYieldMultiplier);
    expect(over.report.fertilizerCostCoins).toBe(100 * CONFIG.fertilizerCostPerHectare);

    const fractional = resolveTurn(
      baselineState(),
      { cultivatedHectares: 50, fertilizedHectares: 12.9, preparedHectares: 0, storeTons: 0 },
      0,
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
      18,
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
      0,
      CONFIG,
    );
    expect(over.state.storageTons).toBe(200);
    expect(over.report.exportTons).toBe(0);

    const negative = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: -50 },
      0,
      CONFIG,
    );
    expect(negative.state.storageTons).toBe(0);
    expect(negative.report.exportTons).toBe(200);

    // Opening storage alone covers Consumption: at least (storage - consumption) must be re-stored.
    const minStore = resolveTurn(
      baselineState({ storageTons: 1_200 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 },
      0,
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
      6,
      CONFIG,
    );
    expect(storeHalf.state.storageTons).toBe(100);
    expect(storeHalf.report.storageUpkeepCoins).toBe(100 * CONFIG.storageUpkeepPerTonPerYear);

    const storeAll = resolveTurn(
      baselineState({ storageTons: 400 }),
      { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 200 },
      6,
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

describe("resolveTurn — events", () => {
  // Fertilized plan: Harvest 1_200 t covers Consumption, so every Event's effect is observable.
  const fullPlan = { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 0, storeTons: 100 };

  it("rolls the Event as the first draw of the Turn and reports none when the roll misses every band", () => {
    const result = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(result.report.event).toBe("none");
  });

  it("rolls a deterministic Event for each seed under the seeded RNG", () => {
    // First draw per seed: none below 0.6, drought in [0.6, 0.8), flood in [0.8, 0.9), shock at 0.9+.
    expect(resolveTurn(baselineState(), fullPlan, 0, CONFIG).report.event).toBe("none");
    expect(resolveTurn(baselineState(), fullPlan, 1, CONFIG).report.event).toBe("drought");
    expect(resolveTurn(baselineState(), fullPlan, 30, CONFIG).report.event).toBe("flood");
    expect(resolveTurn(baselineState(), fullPlan, 4, CONFIG).report.event).toBe("priceShock");
    expect(resolveTurn(baselineState(), fullPlan, 36, CONFIG).report.event).toBe("priceShock");
  });

  it("matches the configured Event probabilities over many seeds", () => {
    const turns = 2_000;
    const counts = { none: 0, drought: 0, flood: 0, priceShock: 0 };
    for (let seed = 0; seed < turns; seed++) {
      counts[resolveTurn(baselineState(), fullPlan, seed, CONFIG).report.event]++;
    }
    // Tolerant bands around the configured probabilities (60% / 20% / 10% / 10%).
    expect(counts.none / turns).toBeGreaterThan(0.55);
    expect(counts.none / turns).toBeLessThan(0.65);
    expect(counts.drought / turns).toBeGreaterThan(0.15);
    expect(counts.drought / turns).toBeLessThan(0.25);
    expect(counts.flood / turns).toBeGreaterThan(0.05);
    expect(counts.flood / turns).toBeLessThan(0.15);
    expect(counts.priceShock / turns).toBeGreaterThan(0.05);
    expect(counts.priceShock / turns).toBeLessThan(0.15);
  });

  it("Drought halves the Harvest via the configured multiplier", () => {
    const baseline = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(baseline.report.event).toBe("drought");
    // 400 ha x 2 t/ha = 800 t base Harvest, halved to 400 t.
    expect(baseline.report.harvestTons).toBe(400);

    const fertilized = resolveTurn(baselineState(), fullPlan, 1, CONFIG);
    expect(fertilized.report.event).toBe("drought");
    // Fertilized plan: 1_200 t base Harvest halved to 600 t.
    expect(fertilized.report.harvestTons).toBe(600);
  });

  it("Flood scales the Harvest and destroys a fraction of opening Storage", () => {
    const result = resolveTurn(baselineState({ storageTons: 400 }), fullPlan, 30, CONFIG);
    expect(result.report.event).toBe("flood");
    // 1_200 t base Harvest x 0.6 flood multiplier.
    expect(result.report.harvestTons).toBe(720);
    // 25% of the 400 t opening Storage is destroyed before food is pooled.
    expect(result.report.storageDestroyedTons).toBe(100);
    expect(result.report.availableFoodTons).toBe(720 + 300);
    // The destroyed tons are gone from next Turn's Storage as well.
    expect(result.state.storageTons).toBe(20);
  });

  it("price shock up sells exports at the clamped doubled price", () => {
    const result = resolveTurn(baselineState(), fullPlan, 4, CONFIG);
    expect(result.report.event).toBe("priceShock");
    // 100 t Surplus exported (storeTons 100 of a 200 t Surplus).
    expect(result.report.exportTons).toBe(100);
    // 10 x 2 = 20, clamped to the world price ceiling of 14.
    expect(result.report.exportPriceCoins).toBe(14);
    expect(result.report.exportIncomeCoins).toBe(1_400);
    // Next Turn walks from the pre-shock price of 10 (shock is this Turn only).
    expect(result.state.worldPrice).toBeGreaterThanOrEqual(10 - CONFIG.worldPriceWalkStep);
    expect(result.state.worldPrice).toBeLessThanOrEqual(10 + CONFIG.worldPriceWalkStep);
  });

  it("price shock down sells exports at the clamped halved price", () => {
    const result = resolveTurn(baselineState(), fullPlan, 36, CONFIG);
    expect(result.report.event).toBe("priceShock");
    expect(result.report.exportTons).toBe(100);
    // 10 x 0.5 = 5, clamped to the world price floor of 7.
    expect(result.report.exportPriceCoins).toBe(7);
    expect(result.report.exportIncomeCoins).toBe(700);
    expect(result.state.worldPrice).toBeGreaterThanOrEqual(10 - CONFIG.worldPriceWalkStep);
    expect(result.state.worldPrice).toBeLessThanOrEqual(10 + CONFIG.worldPriceWalkStep);
  });

  it("eventSummary names the Event and its concrete effect", () => {
    const none = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(eventSummary(none.report)).toBe("No event");

    const drought = resolveTurn(baselineState(), fullPlan, 1, CONFIG);
    expect(eventSummary(drought.report)).toBe("Drought: Yield reduced by 50%, Harvest 600 t");

    const flood = resolveTurn(baselineState({ storageTons: 400 }), fullPlan, 30, CONFIG);
    expect(eventSummary(flood.report)).toBe("Flood: Yield hit and 100 t of Storage destroyed, Harvest 720 t");

    const shockUp = resolveTurn(baselineState(), fullPlan, 4, CONFIG);
    expect(eventSummary(shockUp.report)).toBe("Export price shock: exports sold at 14 coins/ton");
  });

  it("obeys tuned Event config values", () => {
    const forcedDrought = { ...CONFIG, eventNothingProbability: 0, eventDroughtProbability: 1, eventFloodProbability: 0, eventPriceShockProbability: 0 };
    for (const seed of [0, 5, 42]) {
      expect(resolveTurn(baselineState(), fullPlan, seed, forcedDrought).report.event).toBe("drought");
    }

    const quarterYield = { ...forcedDrought, droughtYieldMultiplier: 0.25 };
    // 800 t base Harvest x 0.25.
    expect(resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 5, quarterYield).report.harvestTons).toBe(200);
  });

  it("is deterministic: the same seed resolves to the same Event and numbers", () => {
    const first = resolveTurn(baselineState({ storageTons: 400 }), fullPlan, 30, CONFIG);
    const second = resolveTurn(baselineState({ storageTons: 400 }), fullPlan, 30, CONFIG);
    expect(second).toEqual(first);
  });
});

describe("resolveTurn — technologies", () => {
  const fullPlan = { cultivatedHectares: 400, fertilizedHectares: 200, preparedHectares: 0, storeTons: 100 };

  it("reports no Technology purchases when the plan has none", () => {
    const result = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(result.report.technologiesPurchased).toEqual([]);
    expect(result.report.technologyCostCoins).toBe(0);
    expect(result.state.ownedTechnologies).toEqual([]);
  });

  it("Irrigation halves the Drought Yield loss", () => {
    const without = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(without.report.event).toBe("drought");
    // 800 t base Harvest x 0.5 Drought multiplier.
    expect(without.report.harvestTons).toBe(400);

    const withIrrigation = resolveTurn(baselineState({ ownedTechnologies: ["irrigation"] }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, CONFIG);
    expect(withIrrigation.report.event).toBe("drought");
    // The loss (800 - 400) is halved: 800 x (1 - (1 - 0.5) / 2) = 600 t.
    expect(withIrrigation.report.harvestTons).toBe(600);
  });

  it("High-yield seeds boost the base Yield on every cultivated hectare", () => {
    const without = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 0, CONFIG);
    expect(without.report.harvestTons).toBe(800);

    const withSeeds = resolveTurn(baselineState({ ownedTechnologies: ["highYieldSeeds"] }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 0, CONFIG);
    // 800 t x 1.5.
    expect(withSeeds.report.harvestTons).toBe(1_200);

    const fertilized = resolveTurn(baselineState({ ownedTechnologies: ["highYieldSeeds"] }), fullPlan, 0, CONFIG);
    // (200 ha x 2 + 200 ha x 2 x 2) t = 1_200 t base Harvest x 1.5.
    expect(fertilized.report.harvestTons).toBe(1_800);
  });

  it("Granary halves the Storage upkeep", () => {
    const without = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(without.state.storageTons).toBe(100);
    expect(without.report.storageUpkeepCoins).toBe(100 * CONFIG.storageUpkeepPerTonPerYear);

    const withGranary = resolveTurn(baselineState({ ownedTechnologies: ["granary"] }), fullPlan, 0, CONFIG);
    expect(withGranary.state.storageTons).toBe(100);
    expect(withGranary.report.storageUpkeepCoins).toBe(50 * CONFIG.storageUpkeepPerTonPerYear);
  });

  it("Trade routes raise this Turn's export price without moving the World price", () => {
    const without = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(without.report.exportTons).toBe(100);
    expect(without.report.exportPriceCoins).toBe(10);
    expect(without.report.exportIncomeCoins).toBe(1_000);

    const withRoutes = resolveTurn(baselineState({ ownedTechnologies: ["tradeRoutes"] }), fullPlan, 0, CONFIG);
    // 10 x 1.2 = 12 coins/ton for this Turn's exports only.
    expect(withRoutes.report.exportPriceCoins).toBe(12);
    expect(withRoutes.report.exportIncomeCoins).toBe(1_200);
    // The World price walk is unaffected by the Technology.
    expect(withRoutes.state.worldPrice).toBe(without.state.worldPrice);
  });

  it("Land survey halves the land preparation cost", () => {
    const without = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 10, storeTons: 0 }, 0, CONFIG);
    expect(without.report.landPrepCostCoins).toBe(600);

    const withSurvey = resolveTurn(baselineState({ ownedTechnologies: ["landSurvey"] }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 10, storeTons: 0 }, 0, CONFIG);
    expect(withSurvey.report.landPrepCostCoins).toBe(300);
  });

  it("Fertilizer works halves the fertilizer cost", () => {
    const without = resolveTurn(baselineState(), fullPlan, 0, CONFIG);
    expect(without.report.fertilizerCostCoins).toBe(600);

    const withWorks = resolveTurn(baselineState({ ownedTechnologies: ["fertilizerWorks"] }), fullPlan, 0, CONFIG);
    expect(withWorks.report.fertilizerCostCoins).toBe(300);
  });

  it("charges the purchase to this Turn's Budget and applies the effect from the following Turn", () => {
    const plan: PlayerPlan = { ...fullPlan, purchaseTechnologies: ["highYieldSeeds"] };
    const first = resolveTurn(baselineState(), plan, 0, CONFIG);

    // The cost is itemized in the year report and deducted from this Turn's Budget.
    expect(first.report.technologiesPurchased).toEqual(["highYieldSeeds"]);
    expect(first.report.technologyCostCoins).toBe(CONFIG.technologyCosts.highYieldSeeds);
    const baseSpend = 400 * CONFIG.seedCostPerHectare + 200 * CONFIG.fertilizerCostPerHectare + 100 * CONFIG.storageUpkeepPerTonPerYear; // 800 + 600 + 100
    expect(first.report.budgetSpentCoins).toBe(baseSpend + CONFIG.technologyCosts.highYieldSeeds);

    // The effect is absent on the purchase Turn...
    expect(first.report.harvestTons).toBe(1_200);

    const second = resolveTurn(first.state, fullPlan, 0, CONFIG);
    // ...and present from the following Turn (1_200 t x 1.5).
    expect(second.state.ownedTechnologies).toEqual(["highYieldSeeds"]);
    expect(second.report.harvestTons).toBe(1_800);
  });

  it("ignores already-owned Technologies in the purchase list", () => {
    const plan: PlayerPlan = { ...fullPlan, purchaseTechnologies: ["granary", "irrigation"] };
    const result = resolveTurn(baselineState({ ownedTechnologies: ["granary"] }), plan, 0, CONFIG);

    // The already-owned Granary is not charged again or listed twice.
    expect(result.report.technologiesPurchased).toEqual(["irrigation"]);
    expect(result.report.technologyCostCoins).toBe(CONFIG.technologyCosts.irrigation);
    expect(result.state.ownedTechnologies).toEqual(["granary", "irrigation"]);
  });
});

describe("resolveTurn — score", () => {
  it("tracks the highest population reached during the run", () => {
    const first = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    // Year 1 ends at 960 (partial famine) — below the starting population.
    expect(first.state.highestPopulation).toBe(1_000);

    const second = resolveTurn(first.state, { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(second.state.highestPopulation).toBe(1_000);
  });

  it("raises the Score when a Turn ends above every previous population", () => {
    // Storage covers Consumption so the full 5% growth applies: 1_999 -> 2_099.
    const result = resolveTurn(baselineState({ population: 1_999, storageTons: 1_200 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(2_099);
    expect(result.state.highestPopulation).toBe(2_099);
  });

  it("keeps the previous Score when a Turn ends below it", () => {
    // 2_100 grows to 2_205 (Storage covers Consumption), then the harvest no longer does.
    const grown = resolveTurn(baselineState({ population: 2_100, storageTons: 1_500 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(grown.state.highestPopulation).toBe(2_205);

    const dropped = resolveTurn(grown.state, { cultivatedHectares: 100, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(dropped.report.populationEnd).toBeLessThan(2_205);
    expect(dropped.state.highestPopulation).toBe(2_205);
  });
});

describe("resolveTurn — milestones", () => {
  it("celebrates the Milestone when the population crosses double the starting value", () => {
    // Storage covers Consumption so the full 5% growth applies: 1_999 -> 2_099, crossing 2_000.
    const result = resolveTurn(baselineState({ population: 1_999, storageTons: 1_200 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(2_099);
    expect(result.report.milestoneLevel).toBe(1);
  });

  it("celebrates the Milestone when the population lands exactly on a doubling", () => {
    // round(1_905 x 1.05) = 2_000: landing exactly on the threshold still crosses it.
    const result = resolveTurn(baselineState({ population: 1_905, storageTons: 1_200 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(2_000);
    expect(result.report.milestoneLevel).toBe(1);
  });

  it("does not re-fire a Milestone already passed", () => {
    // Population starts above 2_000 and ends at 2_205: no new doubling crossed.
    const result = resolveTurn(baselineState({ population: 2_100, storageTons: 1_300 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(2_205);
    expect(result.report.milestoneLevel).toBeNull();
  });

  it("celebrates the higher Milestone when a Turn crosses several doublings", () => {
    // A fast-growth config takes 1_000 -> 5_000 in one Turn, crossing both 2_000 and 4_000.
    const fast = { ...CONFIG, populationGrowthRate: 4 };
    const result = resolveTurn(baselineState({ storageTons: 700 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, fast);
    expect(result.report.populationEnd).toBe(5_000);
    expect(result.report.milestoneLevel).toBe(2);
  });

  it("celebrates the quadruple Milestone at four times the starting value", () => {
    // Storage covers Consumption: 3_900 -> 4_095, crossing 4_000 (but not re-crossing 2_000).
    const result = resolveTurn(baselineState({ population: 3_900, storageTons: 3_200 }), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(4_095);
    expect(result.report.milestoneLevel).toBe(2);
  });

  it("reports no Milestone on a famine Turn", () => {
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.famine).toBe("partial");
    expect(result.report.milestoneLevel).toBeNull();
  });
});

describe("resolveTurn — collapse", () => {
  it("ends the run when the population falls below half of the starting value", () => {
    // Harvest 400 t against Consumption 600 t: partial famine drops 600 -> 400, below 500.
    const result = resolveTurn(baselineState({ population: 600 }), { cultivatedHectares: 200, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.famine).toBe("partial");
    expect(result.report.populationEnd).toBe(400);
    expect(result.state.collapsed).toBe(true);
    expect(result.state.collapseCause).toBe("belowHalf");
    // The Score still records the highest population reached, even on a Collapse Turn.
    expect(result.state.highestPopulation).toBe(1_000);
  });

  it("does not collapse when the population lands exactly on half of the starting value", () => {
    // Harvest 500 t against Consumption 600 t: partial famine drops 600 -> exactly 500.
    const result = resolveTurn(baselineState({ population: 600 }), { cultivatedHectares: 250, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(500);
    expect(result.state.collapsed).toBe(false);
    expect(result.state.collapseCause).toBeNull();
  });

  it("ends the run with a total Famine when the population reaches zero", () => {
    // No cultivation, no Storage: nothing to eat, the population is wiped out.
    const result = resolveTurn(baselineState(), { cultivatedHectares: 0, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.famine).toBe("total");
    expect(result.report.populationEnd).toBe(0);
    expect(result.state.collapsed).toBe(true);
    // Zero takes priority over the below-half condition.
    expect(result.state.collapseCause).toBe("totalFamine");
  });

  it("does not collapse while the population stays at or above half of the starting value", () => {
    const result = resolveTurn(baselineState(), { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 12345, CONFIG);
    expect(result.report.populationEnd).toBe(800);
    expect(result.state.collapsed).toBe(false);
    expect(result.state.collapseCause).toBeNull();
  });
});
