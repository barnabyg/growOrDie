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
  fertilizedHectares: number; // 0..cultivatedHectares; those hectares get the boosted Yield
  preparedHectares: number; // new land prepared this turn; cultivable from the next Turn
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
  fertilizerCostCoins: number;
  landPrepCostCoins: number;
  storageUpkeepCoins: number;
  budgetSpentCoins: number; // everything deducted from this Turn's Budget (seeds + fertilizer + land prep + storage upkeep)
  budgetRevenueCoins: number; // tax collected next Turn's Budget
  budgetCarryOverCoins: number; // unspent balance carried into next Turn
}

export interface TurnResult {
  state: GameState; // state of the next Turn
  report: YearReport;
}
