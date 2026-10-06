import { coinRate, tons } from "./format.js";
import type { EventType, YearReport } from "./types.js";

/** Player-facing Event text from one map: the icon, the one-line summary stored
 * in the event log, and the compact chronicle label. Stored summaries are shown
 * as recorded, so changing a summary here only affects newly completed Years. */

type EventReport = Pick<
  YearReport,
  | "droughtYieldLossFraction"
  | "storageDestroyedTons"
  | "harvestTons"
  | "exportPriceCoins"
>;

interface EventText {
  icon: "sun" | "rain" | "trade";
  summary: (report: EventReport) => string;
  label: (report: EventReport) => string;
}

const yieldLoss = (report: EventReport): number =>
  Math.round(report.droughtYieldLossFraction * 100);

const exportPrice = (report: EventReport): string =>
  coinRate(report.exportPriceCoins, "t", 2);

const EVENT_TEXT: Record<EventType, EventText> = {
  none: {
    icon: "sun",
    summary: () => "No event",
    label: () => "No event",
  },
  drought: {
    icon: "sun",
    summary: (report) =>
      `Drought: Yield reduced by ${yieldLoss(report)}%, Harvest ${tons(report.harvestTons)}`,
    label: (report) => `Drought: Yield down ${yieldLoss(report)}%`,
  },
  flood: {
    icon: "rain",
    summary: (report) =>
      `Flood: Yield hit and ${tons(report.storageDestroyedTons)} of Storage destroyed, Harvest ${tons(report.harvestTons)}`,
    label: (report) =>
      report.storageDestroyedTons > 0
        ? `Flood: ${tons(report.storageDestroyedTons)} of Storage lost`
        : "Flood",
  },
  priceShock: {
    icon: "trade",
    summary: (report) =>
      `Export price shock: exports sold at ${exportPrice(report)}`,
    label: (report) => `Export price shock: ${exportPrice(report)}`,
  },
};

/** One-line description of the rolled Event and its concrete effect, for the
 * Year report and the running event log. */
export function eventSummary(
  report: EventReport & Pick<YearReport, "event">,
): string {
  return EVENT_TEXT[report.event].summary(report);
}

/** Compact Event description for a chronicle row. */
export function eventLabel(
  report: EventReport & Pick<YearReport, "event">,
): string {
  return EVENT_TEXT[report.event].label(report);
}

/** Icon id (without the "#icon-" prefix) picturing the Event. */
export function eventIcon(event: EventType): EventText["icon"] {
  return EVENT_TEXT[event].icon;
}
