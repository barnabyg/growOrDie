// All balance numbers for Grow or Die live in this single block.
// Tuning a value here changes simulation behaviour without touching sim logic.
import type { TechnologyId } from "./types.js";

export interface GameConfig {
  startingPopulation: number; // people
  startingArableLandHectares: number;
  startingPreparedLandHectares: number;
  consumptionPerPerson: number; // tons of food per person per year
  baseYieldPerHectare: number; // tons per cultivated hectare (before fertilizer/events)
  fertilizerCostPerHectare: number; // coins per fertilized hectare
  fertilizerYieldMultiplier: number; // Yield multiplier on fertilized hectares
  seedCostPerHectare: number; // coins per cultivated hectare
  landPrepCostPerHectare: number; // one-off coins to prepare a new hectare of Arable land
  taxPerPerson: number; // coins per person per year
  populationGrowthRate: number; // fraction, applied each year Consumption is met
  storageUpkeepPerTonPerYear: number; // coins per stored ton per year
  worldPriceBase: number; // starting World price before the first walk
  worldPriceWalkStep: number; // max coins/ton the World price moves per year
  worldPriceMin: number; // hard floor for the World price
  worldPriceMax: number; // hard ceiling for the World price
  eventNothingProbability: number; // chance of no Event this Turn
  eventDroughtProbability: number; // chance of a Drought (Yield hit)
  eventFloodProbability: number; // chance of a Flood (Yield hit + Storage loss)
  eventPriceShockProbability: number; // chance of an export price shock
  droughtYieldMultiplier: number; // Harvest multiplier under a Drought
  floodYieldMultiplier: number; // Harvest multiplier under a Flood
  floodStorageLossFraction: number; // fraction of opening Storage destroyed by a Flood
  priceShockUpMultiplier: number; // export price multiplier on an upward shock
  priceShockDownMultiplier: number; // export price multiplier on a downward shock
  technologyCosts: Record<TechnologyId, number>; // one-off coins to buy each Technology
  irrigationDroughtLossMultiplier: number; // fraction of the Drought Yield loss that remains with Irrigation owned
  highYieldSeedsYieldMultiplier: number; // Harvest multiplier on every hectare with High-yield seeds owned
  granaryUpkeepMultiplier: number; // Storage upkeep multiplier with Granary owned
  tradeRoutesPriceMultiplier: number; // this Turn's export price multiplier with Trade routes owned
  landSurveyCostMultiplier: number; // land preparation cost multiplier with Land survey owned
  fertilizerWorksCostMultiplier: number; // fertilizer cost multiplier with Fertilizer works owned
}

export const CONFIG: GameConfig = {
  startingPopulation: 1_000,
  startingArableLandHectares: 2_000,
  startingPreparedLandHectares: 400,
  consumptionPerPerson: 1,
  baseYieldPerHectare: 2,
  fertilizerCostPerHectare: 3,
  fertilizerYieldMultiplier: 2,
  seedCostPerHectare: 2,
  landPrepCostPerHectare: 60,
  taxPerPerson: 4,
  populationGrowthRate: 0.05,
  storageUpkeepPerTonPerYear: 1,
  worldPriceBase: 10,
  worldPriceWalkStep: 1.5,
  worldPriceMin: 7,
  worldPriceMax: 14,
  eventNothingProbability: 0.6,
  eventDroughtProbability: 0.2,
  eventFloodProbability: 0.1,
  eventPriceShockProbability: 0.1,
  droughtYieldMultiplier: 0.5,
  floodYieldMultiplier: 0.6,
  floodStorageLossFraction: 0.25,
  priceShockUpMultiplier: 2,
  priceShockDownMultiplier: 0.5,
  technologyCosts: {
    irrigation: 2_000,
    highYieldSeeds: 3_000,
    granary: 2_500,
    tradeRoutes: 3_000,
    landSurvey: 2_000,
    fertilizerWorks: 2_500,
  },
  irrigationDroughtLossMultiplier: 0.5,
  highYieldSeedsYieldMultiplier: 1.5,
  granaryUpkeepMultiplier: 0.5,
  tradeRoutesPriceMultiplier: 1.2,
  landSurveyCostMultiplier: 0.5,
  fertilizerWorksCostMultiplier: 0.5,
};

// All four event probabilities are authoritative. Accept ordinary floating-point
// rounding (for example 0.6 + 0.2 + 0.1 + 0.1), never silently fill a missing share.
export function eventProbabilities(config: GameConfig): number[] {
  const probabilities = [
    config.eventNothingProbability,
    config.eventDroughtProbability,
    config.eventFloodProbability,
    config.eventPriceShockProbability,
  ];
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (
    probabilities.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    ) ||
    Math.abs(total - 1) > 1e-12
  ) {
    throw new RangeError(
      "Event probabilities must be finite, nonnegative, and sum to 1.",
    );
  }
  return probabilities.map((value) => value / total);
}
