import { type GameConfig } from "./config.js";
import { type FamineSeverity, type GameState, type PlayerPlan, type TurnResult, type YearReport } from "./types.js";

export function createNewGame(config: GameConfig): GameState {
  return {
    year: 1,
    population: config.startingPopulation,
    arableLandHectares: config.startingArableLandHectares,
    preparedLandHectares: config.startingPreparedLandHectares,
    storageTons: 0,
    budgetCoins: config.taxPerPerson * config.startingPopulation,
    worldPrice: config.worldPriceBase,
  };
}

// The single test seam: current state + player plan + seed in, next-turn state + year report out.
export function resolveTurn(
  state: GameState,
  plan: PlayerPlan,
  seed: number,
  config: GameConfig,
): TurnResult {
  // `seed` is part of the seam contract: event rolls (a later ticket) will draw
  // a deterministic sequence from it via createRng. No randomness occurs yet, so
  // resolution is trivially deterministic for a given state + plan + seed.

  const cultivatedHectares = Math.max(
    0,
    Math.min(Math.floor(plan.cultivatedHectares), state.preparedLandHectares),
  );

  // Harvest at base Yield (fertilizer and events land in later tickets).
  const harvestTons = cultivatedHectares * config.baseYieldPerHectare;
  const consumptionTons = state.population * config.consumptionPerPerson;
  const availableFoodTons = harvestTons + state.storageTons;

  let famine: FamineSeverity;
  let populationEnd: number;
  if (availableFoodTons >= consumptionTons) {
    famine = "none";
    populationEnd = Math.round(state.population * (1 + config.populationGrowthRate));
  } else if (availableFoodTons <= 0) {
    famine = "total";
    populationEnd = 0;
  } else {
    famine = "partial";
    const shortfallFraction = (consumptionTons - availableFoodTons) / consumptionTons;
    populationEnd = Math.round(state.population * (1 - shortfallFraction));
  }

  // Storage allocation is a later ticket: all surplus rolls into Storage as-is.
  const storageTons = famine === "none" ? availableFoodTons - consumptionTons : 0;

  const seedCostCoins = cultivatedHectares * config.seedCostPerHectare;
  const storageUpkeepCoins = storageTons * config.storageUpkeepPerTonPerYear;
  const budgetSpentCoins = seedCostCoins + storageUpkeepCoins;
  const taxRevenueCoins = populationEnd * config.taxPerPerson;
  const carryOverCoins = state.budgetCoins - budgetSpentCoins;

  const report: YearReport = {
    year: state.year,
    harvestTons,
    consumptionTons,
    availableFoodTons,
    famine,
    populationStart: state.population,
    populationEnd,
    seedCostCoins,
    storageUpkeepCoins,
    budgetSpentCoins,
    budgetRevenueCoins: taxRevenueCoins,
    budgetCarryOverCoins: carryOverCoins,
  };

  const next: GameState = {
    year: state.year + 1,
    population: populationEnd,
    arableLandHectares: state.arableLandHectares,
    preparedLandHectares: state.preparedLandHectares,
    storageTons,
    budgetCoins: taxRevenueCoins + carryOverCoins,
    worldPrice: config.worldPriceBase, // fixed placeholder until the trade ticket lands
  };

  return { state: next, report };
}
