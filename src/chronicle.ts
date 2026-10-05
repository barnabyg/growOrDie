import { coinRate, coins, famineLabel, formatCount, tons } from "./format.js";
import type { EventLogEntry } from "./persistence.js";
import type { EventType, YearReport } from "./types.js";

/** Country chronicle rows: one compact table row per completed Year, newest
 * first. Legacy summary-only entries keep their recorded summary and mark every
 * figure they never stored as Unknown rather than inventing values. */

export const UNKNOWN = "Unknown";

export interface ChronicleRow {
  year: string;
  event: string;
  eventType: EventType;
  harvest: string;
  population: string; // signed change and resulting population, e.g. "+50 to 1,050"
  famine: string | null; // Famine (and Collapse) label; null when the Year had no Famine
  budget: string; // Budget carried into the following Year
  detailed: boolean; // false for legacy summary-only entries
}

function eventLabel(report: YearReport): string {
  switch (report.event) {
    case "drought":
      return `Drought: Yield down ${Math.round(report.droughtYieldLossFraction * 100)}%`;
    case "flood":
      return report.storageDestroyedTons > 0
        ? `Flood: ${tons(report.storageDestroyedTons)} of Storage lost`
        : "Flood";
    case "priceShock":
      return `Export price shock: ${coinRate(report.exportPriceCoins, "t", 2)}`;
    default:
      return "No event";
  }
}

function populationChange(start: number, end: number): string {
  const change = formatCount(end - start);
  const signed = end - start > 0 ? `+${change}` : change;
  return `${signed} to ${formatCount(end)}`;
}

function row(entry: EventLogEntry): ChronicleRow {
  const year = formatCount(entry.year);
  if (!entry.result)
    return {
      year,
      event: entry.summary,
      eventType: entry.event,
      harvest: UNKNOWN,
      population: UNKNOWN,
      famine: null,
      budget: UNKNOWN,
      detailed: false,
    };
  const { state, report } = entry.result;
  const famine = [
    ...(report.famine === "none" ? [] : [famineLabel(report.famine)]),
    ...(state.collapsed ? ["Collapse"] : []),
  ].join(" · ");
  return {
    year,
    event: eventLabel(report),
    eventType: entry.event,
    harvest: tons(report.harvestTons),
    population: populationChange(report.populationStart, report.populationEnd),
    famine: famine || null,
    budget: coins(state.budgetCoins),
    detailed: true,
  };
}

/** Table rows for the saved event log, newest Year first. */
export function chronicleRows(log: readonly EventLogEntry[]): ChronicleRow[] {
  return log.map(row).reverse();
}
