import type { FamineSeverity } from "./types.js";

/** Player-facing formatting shared by every screen: counts, units, rates,
 * plurals and plain-language labels for simulation values. */

/** Whole number rounded and grouped, e.g. "1,600". */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Whole-number change with an explicit sign, e.g. "+50", "-1,200"; no change
 * is "+0" so it never reads as an absolute zero. */
export function signedCount(n: number): string {
  const rounded = Math.round(n);
  return `${rounded < 0 ? "-" : "+"}${formatCount(Math.abs(rounded))}`;
}

/** Number keeping its meaningful decimals, e.g. multipliers such as "1.75". */
export function formatDecimal(n: number): string {
  return n.toLocaleString("en-US");
}

function coinWord(displayed: string): string {
  return displayed === "1" || displayed === "-1" ? "coin" : "coins";
}

/** Money rounded to whole coins, e.g. "1 coin", "3,200 coins". */
export function coins(n: number): string {
  const value = formatCount(n);
  return `${value} ${coinWord(value)}`;
}

/** Money keeping decimals, for configured prices, e.g. "1.5 coins". */
export function exactCoins(n: number): string {
  const value = formatDecimal(n);
  return `${value} ${coinWord(value)}`;
}

/** Food in tons, e.g. "1,600 t". */
export function tons(n: number): string {
  return `${formatCount(n)} t`;
}

/** Food in tons keeping decimals, for exact Storage amounts, e.g. "512.5 t". */
export function exactTons(n: number): string {
  return `${formatDecimal(n)} t`;
}

/** Land in hectares, e.g. "400 ha". */
export function hectares(n: number): string {
  return `${formatCount(n)} ha`;
}

/** A price per ton or hectare, e.g. "1 coin/t", "1.8 coins/ha" or, with
 * fixed decimals, "10.00 coins/t". */
export function coinRate(
  n: number,
  per: "t" | "ha",
  fractionDigits?: number,
): string {
  const value =
    fractionDigits === undefined ? formatDecimal(n) : n.toFixed(fractionDigits);
  return `${value} ${coinWord(value)}/${per}`;
}

const FAMINE_LABELS: Record<FamineSeverity, string> = {
  none: "No famine",
  partial: "Partial famine",
  total: "Total famine",
};

/** Plain-language Famine outcome, never the raw severity identifier. */
export function famineLabel(famine: FamineSeverity): string {
  return FAMINE_LABELS[famine];
}

/** A number of Turns, displayed in-game as Years, e.g. "1 Year", "6 Years". */
export function years(n: number): string {
  return `${formatCount(n)} ${n === 1 ? "Year" : "Years"}`;
}
