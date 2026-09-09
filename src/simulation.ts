import { economyRates, isAffordable, planCosts } from "./economy.js";
import { createRng } from "./rng.js";
import { eventProbabilities, type GameConfig } from "./config.js";
import type {
  CollapseCause,
  EventType,
  FamineSeverity,
  GameState,
  PlayerPlan,
  TurnResult,
  YearReport,
} from "./types.js";

export function createNewGame(config: GameConfig): GameState {
  return {
    year: 1,
    population: config.startingPopulation,
    highestPopulation: config.startingPopulation,
    collapsed: false,
    collapseCause: null,
    arableLandHectares: config.startingArableLandHectares,
    preparedLandHectares: config.startingPreparedLandHectares,
    storageTons: 0,
    budgetCoins: config.taxPerPerson * config.startingPopulation,
    worldPrice: config.worldPriceBase,
    ownedTechnologies: [],
  };
}

// Harvest for a given allocation at the base Yield rules (no Events); shared with
// the UI's pre-event Surplus estimate so the plan preview never drifts from resolution.
export function estimateHarvestTons(
  config: GameConfig,
  cultivatedHectares: number,
  fertilizedHectares: number,
  highYieldSeedsOwned: boolean,
): number {
  const baseYieldTons =
    (cultivatedHectares - fertilizedHectares) * config.baseYieldPerHectare;
  const boostedYieldTons =
    fertilizedHectares *
    config.baseYieldPerHectare *
    config.fertilizerYieldMultiplier;
  const yieldTons = baseYieldTons + boostedYieldTons;
  return highYieldSeedsOwned
    ? yieldTons * config.highYieldSeedsYieldMultiplier
    : yieldTons;
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

  const probabilities = eventProbabilities(config);
  const rng = createRng(seed);

  // The Event is rolled once per Turn before anything else happens: no warnings or
  // forecasts, revealed only when the Turn resolves.
  const eventRoll = rng();
  let event: EventType = "none";
  const events: EventType[] = ["none", "drought", "flood", "priceShock"];
  let cumulativeProbability = 0;
  for (const [index, candidate] of events.entries()) {
    cumulativeProbability += probabilities[index] ?? 0;
    if (eventRoll < cumulativeProbability) {
      event = candidate;
      break;
    }
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
    Math.min(
      Math.floor(plan.preparedHectares),
      state.arableLandHectares - state.preparedLandHectares,
    ),
  );

  // Technologies are one-off purchases: the cost hits this Turn's Budget, but every
  // effect applies from the following Turn — all effects below read the previously
  // owned set. Already-owned (or duplicated) entries are ignored and never re-charged.
  const ownedTechnologies = new Set(state.ownedTechnologies);
  const purchasedTechnologies = [
    ...new Set(
      (plan.purchaseTechnologies ?? []).filter(
        (id) => !ownedTechnologies.has(id),
      ),
    ),
  ];

  // Base Harvest, then the rolled Event scales it (drought/flood) before Consumption.
  const baseHarvestTons = estimateHarvestTons(
    config,
    cultivatedHectares,
    fertilizedHectares,
    ownedTechnologies.has("highYieldSeeds"),
  );
  // Irrigation halves the Drought Yield loss: it shrinks the lost fraction instead of
  // halving the surviving multiplier (which would double the loss).
  const droughtMultiplier = ownedTechnologies.has("irrigation")
    ? 1 -
      (1 - config.droughtYieldMultiplier) *
        config.irrigationDroughtLossMultiplier
    : config.droughtYieldMultiplier;
  const harvestTons =
    event === "drought"
      ? baseHarvestTons * droughtMultiplier
      : event === "flood"
        ? baseHarvestTons * config.floodYieldMultiplier
        : baseHarvestTons;
  const consumptionTons = state.population * config.consumptionPerPerson;

  // A Flood destroys a fraction of the opening Storage before food is pooled.
  const storageDestroyedTons =
    event === "flood" ? state.storageTons * config.floodStorageLossFraction : 0;
  const availableFoodTons =
    harvestTons + (state.storageTons - storageDestroyedTons);

  let famine: FamineSeverity;
  let populationEnd: number;
  if (availableFoodTons >= consumptionTons) {
    famine = "none";
    populationEnd = Math.round(
      state.population * (1 + config.populationGrowthRate),
    );
  } else if (availableFoodTons <= 0) {
    famine = "total";
    populationEnd = 0;
  } else {
    famine = "partial";
    const shortfallFraction =
      (consumptionTons - availableFoodTons) / consumptionTons;
    populationEnd = Math.round(state.population * (1 - shortfallFraction));
  }

  // A Milestone fires when the Turn ends at or beyond a doubling of the starting
  // population (x2, x4, x8...) that it started below. If one Turn crosses several
  // doublings, only the highest newly reached level is celebrated.
  let milestoneLevel: number | null = null;
  for (let level = 1; ; level++) {
    const threshold = config.startingPopulation * 2 ** level;
    if (threshold > populationEnd) break;
    if (state.population < threshold) milestoneLevel = level;
  }

  // Collapse ends the run: a total Famine (population zero) takes priority,
  // otherwise falling strictly below half of the starting population. Landing
  // exactly on half still leaves the run alive.
  let collapseCause: CollapseCause | null = null;
  if (populationEnd === 0) {
    collapseCause = "totalFamine";
  } else if (populationEnd < config.startingPopulation / 2) {
    collapseCause = "belowHalf";
  }

  // Storage allocation: the player chooses how much of the Surplus to keep. Stored
  // food can never be exported, so only new harvest may leave — if opening Storage
  // surviving a Flood alone covers Consumption, its unconsumed remainder must be re-stored.
  // Famine turns store nothing and export nothing.
  const surplusTons = availableFoodTons - consumptionTons;
  let storageTons = 0;
  let exportTons = 0;
  if (famine === "none" && surplusTons > 0) {
    const minStoreTons = Math.max(
      0,
      state.storageTons - storageDestroyedTons - consumptionTons,
    );
    const rawStoreTons = Number.isFinite(plan.storeTons) ? plan.storeTons : 0;
    storageTons = Math.max(minStoreTons, Math.min(rawStoreTons, surplusTons));
    exportTons = surplusTons - storageTons;
  }

  // Un-stored Surplus auto-exports at this Turn's World price (the one shown before
  // the player allocated). A price shock scales only this Turn's export price by a
  // coin flip, clamped to the World price bounds; next Turn walks from the pre-shock
  // price. No manual sales step.
  const baseExportPriceCoins =
    event === "priceShock"
      ? Math.max(
          config.worldPriceMin,
          Math.min(
            config.worldPriceMax,
            // The shock direction is the next draw: up on [0, 0.5), down on [0.5, 1).
            state.worldPrice *
              (rng() < 0.5
                ? config.priceShockUpMultiplier
                : config.priceShockDownMultiplier),
          ),
        )
      : state.worldPrice;
  // Trade routes multiply this Turn's final export price only — after any shock and
  // clamp, so it may sit above the World price ceiling. The World price walk is untouched.
  const exportPriceCoins =
    baseExportPriceCoins * economyRates(state, config).trade;
  const exportIncomeCoins = exportTons * exportPriceCoins;

  // World price random walk for next Turn: ±step, clamped to [min, max].
  const nextWorldPrice = Math.max(
    config.worldPriceMin,
    Math.min(
      config.worldPriceMax,
      state.worldPrice + (rng() * 2 - 1) * config.worldPriceWalkStep,
    ),
  );

  const costs = planCosts(
    state,
    { ...plan, cultivatedHectares, fertilizedHectares, preparedHectares },
    storageTons,
    config,
  );
  const mandatoryStorageTons = Math.max(
    0,
    state.storageTons - storageDestroyedTons - consumptionTons,
  );
  if (!isAffordable(state, costs, mandatoryStorageTons, config))
    throw new Error("Plan exceeds available budget including storage upkeep");
  const seedCostCoins = costs.seeds;
  const fertilizerCostCoins = costs.fertilizer;
  const landPrepCostCoins = costs.preparation;
  const storageUpkeepCoins = costs.upkeep;
  const technologyCostCoins = costs.technologies;
  const budgetSpentCoins = costs.total;
  const taxRevenueCoins = populationEnd * config.taxPerPerson;
  const carryOverCoins = state.budgetCoins - budgetSpentCoins;
  const revenueCoins = taxRevenueCoins + exportIncomeCoins;

  const report: YearReport = {
    year: state.year,
    harvestTons,
    droughtYieldLossFraction: event === "drought" ? 1 - droughtMultiplier : 0,
    consumptionTons,
    availableFoodTons,
    famine,
    populationStart: state.population,
    populationEnd,
    milestoneLevel,
    seedCostCoins,
    fertilizerCostCoins,
    landPrepCostCoins,
    storageUpkeepCoins,
    technologiesPurchased: purchasedTechnologies,
    technologyCostCoins,
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
    highestPopulation: Math.max(state.highestPopulation, populationEnd),
    collapsed: collapseCause !== null,
    collapseCause,
    arableLandHectares: state.arableLandHectares,
    preparedLandHectares: state.preparedLandHectares + preparedHectares,
    storageTons,
    budgetCoins: revenueCoins + carryOverCoins,
    worldPrice: nextWorldPrice,
    ownedTechnologies: [...state.ownedTechnologies, ...purchasedTechnologies],
  };

  return { state: next, report };
}

// One-line description of the rolled Event and its concrete effect, for the year
// report and the running event log.
export function eventSummary(report: YearReport): string {
  switch (report.event) {
    case "drought":
      return `Drought: Yield reduced by ${Math.round(report.droughtYieldLossFraction * 100)}%, Harvest ${Math.round(report.harvestTons)} t`;
    case "flood":
      return `Flood: Yield hit and ${Math.round(report.storageDestroyedTons)} t of Storage destroyed, Harvest ${Math.round(report.harvestTons)} t`;
    case "priceShock":
      return `Export price shock: exports sold at ${Math.round(report.exportPriceCoins)} coins/ton`;
    default:
      return "No event";
  }
}
