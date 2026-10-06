import type { GameConfig } from "./config.js";
import { estimateHarvestTons } from "./simulation.js";
import type { GameState, PlayerPlan } from "./types.js";

/** Food for one weather scenario. */
export interface FoodScenario {
  harvestTons: number;
  /** Opening Storage that survives the scenario. */
  storageTons: number;
  availableFoodTons: number;
  /** Available food minus Consumption; negative is a shortfall. */
  balanceTons: number;
}

export interface FoodOutlook {
  consumptionTons: number;
  ordinary: FoodScenario;
  drought: FoodScenario;
  flood: FoodScenario;
}

/** Possible food outcomes, not a prediction of the hidden Event. Newly bought
 * Technologies and newly prepared land cannot improve this year's production. */
export function foodOutlook(
  state: GameState,
  plan: PlayerPlan,
  config: GameConfig,
): FoodOutlook {
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
  const scenario = (yieldMultiplier: number, storageLoss = 0): FoodScenario => {
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

/** Widths for the single food bar, as percentages of the larger of available
 * food and Consumption: Harvest, then opening Storage, then any shortfall up to
 * the Consumption marker. */
export function foodBarLayout(
  outlook: Pick<FoodOutlook, "consumptionTons" | "ordinary">,
) {
  const { harvestTons, storageTons, availableFoodTons } = outlook.ordinary;
  const scale = Math.max(1, availableFoodTons, outlook.consumptionTons);
  const percent = (tons: number) => (tons / scale) * 100;
  return {
    harvestPercent: percent(harvestTons),
    storagePercent: percent(storageTons),
    shortfallPercent: percent(
      Math.max(0, outlook.consumptionTons - availableFoodTons),
    ),
    consumptionPercent: percent(outlook.consumptionTons),
  };
}
