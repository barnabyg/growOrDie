import { createRng } from "./rng.js";
import { type GameConfig } from "./config.js";
import { type EventType, type FamineSeverity, type GameState, type PlayerPlan, type TurnResult, type YearReport } from "./types.js";

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

// Harvest for a given allocation at the base Yield rules (no Events); shared with
// the UI's pre-event Surplus estimate so the plan preview never drifts from resolution.
export function estimateHarvestTons(
  config: GameConfig,
  cultivatedHectares: number,
  fertilizedHectares: number,
): number {
  const baseYieldTons = (cultivatedHectares - fertilizedHectares) * config.baseYieldPerHectare;
  const boostedYieldTons = fertilizedHectares * config.baseYieldPerHectare * config.fertilizerYieldMultiplier;
  return baseYieldTons + boostedYieldTons;
}

// The single test seam: current state + player plan + seed in, next-turn state + year report out.
export function resolveTurn(
  state: GameState,
  plan: PlayerPlan,
  seed: number,
  config: GameConfig,
): TurnResult {
  // `seed` is part of the seam contract: every random effect draws a deterministic
  // sequence from it via createRng, in resolution order (ADR-0001): the Event roll
  // first, then the World price walk last.

  const rng = createRng(seed);

  // The Event is rolled once per Turn before anything else happens: no warnings or
  // forecasts, revealed only when the Turn resolves.
  const eventRoll = rng();
  let event: EventType = "none";
  if (eventRoll < config.eventNothingProbability) {
    event = "none";
  } else if (eventRoll < config.eventNothingProbability + config.eventDroughtProbability) {
    event = "drought";
  } else if (eventRoll < config.eventNothingProbability + config.eventDroughtProbability + config.eventFloodProbability) {
    event = "flood";
  } else {
    // The shock direction is the next draw: up on [0, 0.5), down on [0.5, 1).
    event = "priceShock";
  }

  const cultivatedHectares = Math.max(
    0,
    Math.min(Math.floor(plan.cultivatedHectares), state.preparedLandHectares),
  );

  const fertilizedHectares = Math.max(
    0,
    Math.min(Math.floor(plan.fertilizedHectares), cultivatedHectares),
  );

  // New land prepared this Turn is cultivable from the next Turn: this Turn's
  // cultivation was already clamped to the previously prepared hectares.
  const preparedHectares = Math.max(
    0,
    Math.min(Math.floor(plan.preparedHectares), state.arableLandHectares - state.preparedLandHectares),
  );

  // Base Harvest, then the rolled Event scales it (drought/flood) before Consumption.
  const baseHarvestTons = estimateHarvestTons(config, cultivatedHectares, fertilizedHectares);
  const harvestTons =
    event === "drought" ? baseHarvestTons * config.droughtYieldMultiplier
    : event === "flood" ? baseHarvestTons * config.floodYieldMultiplier
    : baseHarvestTons;
  const consumptionTons = state.population * config.consumptionPerPerson;

  // A Flood destroys a fraction of the opening Storage before food is pooled.
  const storageDestroyedTons = event === "flood" ? state.storageTons * config.floodStorageLossFraction : 0;
  const availableFoodTons = harvestTons + (state.storageTons - storageDestroyedTons);

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

  // Storage allocation: the player chooses how much of the Surplus to keep. Stored
  // food can never be exported, so only new harvest may leave — if opening Storage
  // alone covers Consumption, at least (storage - consumption) must be re-stored.
  // Famine turns store nothing and export nothing.
  const surplusTons = availableFoodTons - consumptionTons;
  let storageTons = 0;
  let exportTons = 0;
  if (famine === "none" && surplusTons > 0) {
    const minStoreTons = Math.max(0, state.storageTons - consumptionTons);
    const rawStoreTons = Number.isFinite(plan.storeTons) ? plan.storeTons : 0;
    storageTons = Math.max(minStoreTons, Math.min(rawStoreTons, surplusTons));
    exportTons = surplusTons - storageTons;
  }

  // Un-stored Surplus auto-exports at this Turn's World price (the one shown before
  // the player allocated). A price shock scales only this Turn's export price by a
  // coin flip, clamped to the World price bounds; next Turn walks from the pre-shock
  // price. No manual sales step.
  const exportPriceCoins =
    event === "priceShock"
      ? Math.max(
          config.worldPriceMin,
          Math.min(
            config.worldPriceMax,
            // The shock direction is the next draw: up on [0, 0.5), down on [0.5, 1).
            state.worldPrice * (rng() < 0.5 ? config.priceShockUpMultiplier : config.priceShockDownMultiplier),
          ),
        )
      : state.worldPrice;
  const exportIncomeCoins = exportTons * exportPriceCoins;

  // World price random walk for next Turn: ±step, clamped to [min, max].
  const nextWorldPrice = Math.max(
    config.worldPriceMin,
    Math.min(config.worldPriceMax, state.worldPrice + (rng() * 2 - 1) * config.worldPriceWalkStep),
  );

  const seedCostCoins = cultivatedHectares * config.seedCostPerHectare;
  const fertilizerCostCoins = fertilizedHectares * config.fertilizerCostPerHectare;
  const landPrepCostCoins = preparedHectares * config.landPrepCostPerHectare;
  const storageUpkeepCoins = storageTons * config.storageUpkeepPerTonPerYear;
  const budgetSpentCoins = seedCostCoins + fertilizerCostCoins + landPrepCostCoins + storageUpkeepCoins;
  const taxRevenueCoins = populationEnd * config.taxPerPerson;
  const carryOverCoins = state.budgetCoins - budgetSpentCoins;
  const revenueCoins = taxRevenueCoins + exportIncomeCoins;

  const report: YearReport = {
    year: state.year,
    harvestTons,
    consumptionTons,
    availableFoodTons,
    famine,
    populationStart: state.population,
    populationEnd,
    seedCostCoins,
    fertilizerCostCoins,
    landPrepCostCoins,
    storageUpkeepCoins,
    event,
    storageDestroyedTons,
    exportTons,
    exportPriceCoins,
    exportIncomeCoins,
    budgetSpentCoins,
    budgetRevenueCoins: revenueCoins,
    budgetCarryOverCoins: carryOverCoins,
  };

  const next: GameState = {
    year: state.year + 1,
    population: populationEnd,
    arableLandHectares: state.arableLandHectares,
    preparedLandHectares: state.preparedLandHectares + preparedHectares,
    storageTons,
    budgetCoins: revenueCoins + carryOverCoins,
    worldPrice: nextWorldPrice,
  };

  return { state: next, report };
}

// One-line description of the rolled Event and its concrete effect, for the year
// report and the running event log.
export function eventSummary(report: YearReport): string {
  switch (report.event) {
    case "drought":
      return `Drought: Yield halved, Harvest ${Math.round(report.harvestTons)} t`;
    case "flood":
      return `Flood: Yield hit and ${Math.round(report.storageDestroyedTons)} t of Storage destroyed, Harvest ${Math.round(report.harvestTons)} t`;
    case "priceShock":
      return `Export price shock: exports sold at ${Math.round(report.exportPriceCoins)} coins/ton`;
    default:
      return "No event";
  }
}
