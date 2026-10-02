import type { GameConfig } from "./config.js";
import { estimateHarvestTons } from "./simulation.js";
import type { GameState, PlayerPlan } from "./types.js";

/** Possible food outcomes, not a prediction of the hidden Event. Newly bought
 * Technologies and newly prepared land cannot improve this year's production. */
export function foodOutlook(
  state: GameState,
  plan: PlayerPlan,
  config: GameConfig,
) {
  const harvest = estimateHarvestTons(
    config,
    plan.cultivatedHectares,
    plan.fertilizedHectares,
    state.ownedTechnologies.includes("highYieldSeeds"),
  );
  const consumption = state.population * config.consumptionPerPerson;
  const droughtMultiplier = state.ownedTechnologies.includes("irrigation")
    ? 1 -
      (1 - config.droughtYieldMultiplier) *
        config.irrigationDroughtLossMultiplier
    : config.droughtYieldMultiplier;
  const scenario = (yieldMultiplier: number, storageLoss = 0) => {
    const harvestTons = harvest * yieldMultiplier;
    const storageTons = state.storageTons * (1 - storageLoss);
    return {
      harvestTons,
      storageTons,
      availableFoodTons: harvestTons + storageTons,
      balanceTons: harvestTons + storageTons - consumption,
    };
  };
  return {
    consumptionTons: consumption,
    ordinary: scenario(1),
    drought: scenario(droughtMultiplier),
    flood: scenario(
      config.floodYieldMultiplier,
      config.floodStorageLossFraction,
    ),
  };
}
