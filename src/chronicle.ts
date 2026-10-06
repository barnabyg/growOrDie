import {
  coins,
  famineLabel,
  formatCount,
  signedCount,
  tons,
} from "./format.js";
import { eventLabel } from "./event-text.js";
import type { EventLogEntry } from "./persistence.js";
import type { EventType } from "./types.js";

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

function populationOutcome(start: number, end: number): string {
  return `${signedCount(end - start)} to ${formatCount(end)}`;
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
    population: populationOutcome(report.populationStart, report.populationEnd),
    famine: famine || null,
    budget: coins(state.budgetCoins),
    detailed: true,
  };
}

/** Table rows for the saved event log, newest Year first. */
export function chronicleRows(log: readonly EventLogEntry[]): ChronicleRow[] {
  return log.map(row).reverse();
}
