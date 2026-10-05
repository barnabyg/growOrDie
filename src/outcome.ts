import { famineLabel, formatCount as fmt, tons } from "./format.js";
import type { YearReport } from "./types.js";

/** Headline text shared by the allocation and Year report outcome screens. */

export interface OutcomeHeadline {
  // The key number: Population change, or the food shortfall during Famine.
  lead: string;
  // Plain-language Famine outcome, so Famine never relies on colour alone.
  context: string;
  famine: boolean;
}

type OutcomeReport = Pick<
  YearReport,
  | "famine"
  | "populationStart"
  | "populationEnd"
  | "consumptionTons"
  | "availableFoodTons"
>;

function signed(n: number): string {
  return `${n >= 0 ? "+" : "-"}${fmt(Math.abs(n))}`;
}

export function outcomeHeadline(report: OutcomeReport): OutcomeHeadline {
  const famine = report.famine !== "none";
  const change = report.populationEnd - report.populationStart;
  const lead = famine
    ? `${tons(Math.max(0, report.consumptionTons - report.availableFoodTons))} shortfall`
    : `${signed(change)} ${Math.abs(change) === 1 ? "person" : "people"}`;
  return { lead, context: famineLabel(report.famine), famine };
}

/** Population before and after the Year with its signed change, e.g. "1,000 → 1,050 (+50)". */
export function populationChange(
  report: Pick<YearReport, "populationStart" | "populationEnd">,
): string {
  return `${fmt(report.populationStart)} → ${fmt(report.populationEnd)} (${signed(report.populationEnd - report.populationStart)})`;
}
