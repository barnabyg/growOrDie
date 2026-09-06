// All balance numbers for Grow or Die live in this single block.
// Tuning a value here changes simulation behaviour without touching sim logic.
export interface GameConfig {
  startingPopulation: number; // people
  startingArableLandHectares: number;
  startingPreparedLandHectares: number;
  consumptionPerPerson: number; // tons of food per person per year
  baseYieldPerHectare: number; // tons per cultivated hectare (before fertilizer/events)
  seedCostPerHectare: number; // coins per cultivated hectare
  taxPerPerson: number; // coins per person per year
  populationGrowthRate: number; // fraction, applied each year Consumption is met
  storageUpkeepPerTonPerYear: number; // coins per stored ton per year
  worldPriceBase: number; // fixed World price placeholder until the trade ticket lands
}

export const CONFIG: GameConfig = {
  startingPopulation: 1_000,
  startingArableLandHectares: 2_000,
  startingPreparedLandHectares: 400,
  consumptionPerPerson: 1,
  baseYieldPerHectare: 2,
  seedCostPerHectare: 2,
  taxPerPerson: 4,
  populationGrowthRate: 0.05,
  storageUpkeepPerTonPerYear: 1,
  worldPriceBase: 10,
};
