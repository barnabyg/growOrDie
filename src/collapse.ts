import { famineLabel, formatCount as fmt, tons, years } from "./format.js";
import type { SaveData } from "./persistence.js";

/** Text for the Collapse summary: why the run ended, in the final Year's food
 * figures, plus the Event (only when one occurred), run length and Score. */
export interface CollapseSummary {
  cause: string;
  // Empty when the final Year had no Event.
  event: string;
  runLength: string;
  score: string;
}

export function collapseSummary(
  save: SaveData,
  startingPopulation: number,
): CollapseSummary {
  const { state } = save;
  const latest = save.eventLog.at(-1);
  const report = latest?.result?.report;
  const totalFamine = state.collapseCause === "totalFamine";
  let cause: string;
  if (report) {
    // Stored food is the opening Storage that survived any flood.
    const food = `${famineLabel(report.famine)}: Harvest ${tons(report.harvestTons)} and ${tons(report.availableFoodTons - report.harvestTons)} stored against ${tons(report.consumptionTons)} needed.`;
    cause = totalFamine
      ? `${food} No one could be fed, so the population reached zero.`
      : `${food} Population fell from ${fmt(report.populationStart)} to ${fmt(report.populationEnd)}, below half the starting ${fmt(startingPopulation)}.`;
  } else {
    // Legacy saves may keep only the final Year's summary line.
    cause = totalFamine
      ? "Total famine: no food at all, the population reached zero."
      : `The population fell below half of the starting ${fmt(startingPopulation)}.`;
  }
  return {
    cause,
    event: latest && latest.event !== "none" ? latest.summary : "",
    // A Collapsed run never plays its next Year.
    runLength: years(state.year - 1),
    score: fmt(state.highestPopulation),
  };
}
