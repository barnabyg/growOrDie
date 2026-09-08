import type { GameConfig } from "./config.js";
import type { GameState, PlayerPlan } from "./types.js";

/** Rates depend only on technologies owned before this year's purchases. */
export function economyRates(state: GameState, config: GameConfig) {
  const owned = new Set(state.ownedTechnologies);
  return {
    fertilizer: config.fertilizerCostPerHectare * (owned.has("fertilizerWorks") ? config.fertilizerWorksCostMultiplier : 1),
    preparation: config.landPrepCostPerHectare * (owned.has("landSurvey") ? config.landSurveyCostMultiplier : 1),
    upkeep: config.storageUpkeepPerTonPerYear * (owned.has("granary") ? config.granaryUpkeepMultiplier : 1),
    trade: owned.has("tradeRoutes") ? config.tradeRoutesPriceMultiplier : 1,
  };
}

export function planCosts(state: GameState, plan: PlayerPlan, storageTons: number, config: GameConfig) {
  const rates = economyRates(state, config);
  const purchased = [...new Set((plan.purchaseTechnologies ?? []).filter(id => !state.ownedTechnologies.includes(id)))];
  const seeds = plan.cultivatedHectares * config.seedCostPerHectare;
  const fertilizer = plan.fertilizedHectares * rates.fertilizer;
  const preparation = plan.preparedHectares * rates.preparation;
  const technologies = purchased.reduce((sum, id) => sum + config.technologyCosts[id], 0);
  const upkeep = storageTons * rates.upkeep;
  return { seeds, fertilizer, preparation, technologies, upkeep, production: seeds + fertilizer + preparation + technologies, total: seeds + fertilizer + preparation + technologies + upkeep };
}
