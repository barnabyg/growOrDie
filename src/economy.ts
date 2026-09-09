import type { GameConfig } from "./config.js";
import type { GameState, PlayerPlan } from "./types.js";

/** Rates depend only on technologies owned before this year's purchases. */
export function economyRates(state: GameState, config: GameConfig) {
  const owned = new Set(state.ownedTechnologies);
  return {
    fertilizer:
      config.fertilizerCostPerHectare *
      (owned.has("fertilizerWorks") ? config.fertilizerWorksCostMultiplier : 1),
    preparation:
      config.landPrepCostPerHectare *
      (owned.has("landSurvey") ? config.landSurveyCostMultiplier : 1),
    upkeep:
      config.storageUpkeepPerTonPerYear *
      (owned.has("granary") ? config.granaryUpkeepMultiplier : 1),
    trade: owned.has("tradeRoutes") ? config.tradeRoutesPriceMultiplier : 1,
  };
}

export function planCosts(
  state: GameState,
  plan: PlayerPlan,
  storageTons: number,
  config: GameConfig,
) {
  const rates = economyRates(state, config);
  const purchased = [
    ...new Set(
      (plan.purchaseTechnologies ?? []).filter(
        (id) => !state.ownedTechnologies.includes(id),
      ),
    ),
  ];
  const seeds = plan.cultivatedHectares * config.seedCostPerHectare;
  const fertilizer = plan.fertilizedHectares * rates.fertilizer;
  const preparation = plan.preparedHectares * rates.preparation;
  const technologies = purchased.reduce(
    (sum, id) => sum + config.technologyCosts[id],
    0,
  );
  const upkeep = storageTons * rates.upkeep;
  return {
    seeds,
    fertilizer,
    preparation,
    technologies,
    upkeep,
    production: seeds + fertilizer + preparation + technologies,
    total: seeds + fertilizer + preparation + technologies + upkeep,
  };
}

/** Old saves may have debt or unavoidable retained-food upkeep. Zero discretionary
 * spending remains playable; only that mandatory bill may increase existing debt. */
export function isAffordable(
  state: GameState,
  costs: ReturnType<typeof planCosts>,
  mandatoryStorageTons: number,
  config: GameConfig,
): boolean {
  const mandatoryUpkeep =
    mandatoryStorageTons * economyRates(state, config).upkeep;
  return (
    costs.total <= Math.max(state.budgetCoins, mandatoryUpkeep) + 1e-8 &&
    costs.production <= Math.max(0, state.budgetCoins - mandatoryUpkeep) + 1e-8
  );
}
