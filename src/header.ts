import { coins, formatCount as fmt, signedCount, tons } from "./format.js";
import type { SaveData } from "./persistence.js";

// Text for the resource header: where the player is in the run and what they have.

export interface ResourceHeader {
  year: string;
  population: string;
  // Population change in the latest completed Year; empty before the first one.
  populationChange: string;
  storage: string;
  budget: string;
  // True while a Harvest awaits allocation: the values are this Year's opening ones.
  opening: boolean;
  // Where the player is in the Year, without repeating the current Year number.
  status: string;
}

export function resourceHeader(save: SaveData): ResourceHeader {
  const { state } = save;
  const latest = save.eventLog.at(-1);
  const report = latest?.result?.report;
  return {
    // A Collapsed run never plays its next Year, so show the final Year played.
    year: String(state.collapsed ? state.year - 1 : state.year),
    population: fmt(state.population),
    populationChange: report
      ? `${signedCount(report.populationEnd - report.populationStart)} last Year`
      : "",
    storage: tons(state.storageTons),
    budget: coins(state.budgetCoins),
    opening: save.pendingTurn !== undefined,
    status: state.collapsed
      ? "Run complete · start a new country when you're ready"
      : save.pendingTurn
        ? "Harvest committed · choose Storage to finish the Year"
        : latest
          ? `Year ${latest.year} complete · plan the next Harvest`
          : "Your first Year · plan a Harvest to feed your people",
  };
}
