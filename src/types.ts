export interface GameState {
  year: number; // current Turn, displayed as "Year N"
  population: number;
  arableLandHectares: number;
  preparedLandHectares: number;
  storageTons: number;
  budgetCoins: number; // Budget available this Turn (revenue + carry-over)
  worldPrice: number; // visible to the player before they allocate
}

export interface PlayerPlan {
  cultivatedHectares: number; // 0..preparedLandHectares
}

export type FamineSeverity = "none" | "partial" | "total";

export interface YearReport {
  year: number;
  harvestTons: number;
  consumptionTons: number;
  availableFoodTons: number; // harvest + opening storage, before Consumption
  famine: FamineSeverity;
  populationStart: number;
  populationEnd: number;
  seedCostCoins: number;
  storageUpkeepCoins: number;
  budgetSpentCoins: number; // everything deducted from this Turn's Budget (seeds + storage upkeep)
  budgetRevenueCoins: number; // tax collected next Turn's Budget
  budgetCarryOverCoins: number; // unspent balance carried into next Turn
}

export interface TurnResult {
  state: GameState; // state of the next Turn
  report: YearReport;
}
