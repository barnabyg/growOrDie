import type { GameConfig } from "./config.js";
import { exactCoins } from "./format.js";
import type { TechnologyId } from "./types.js";

/** Player-facing copy for Technology cards: one benefit line derived from
 * configuration and a status shown only when it differs from the default. */

// Each Technology's configured multiplier and the quantity it scales.
const EFFECTS: Record<
  TechnologyId,
  { multiplier: (config: GameConfig) => number; subject: string }
> = {
  irrigation: {
    multiplier: (c) => c.irrigationDroughtLossMultiplier,
    subject: "Yield lost to drought",
  },
  highYieldSeeds: {
    multiplier: (c) => c.highYieldSeedsYieldMultiplier,
    subject: "food per hectare",
  },
  granary: {
    multiplier: (c) => c.granaryUpkeepMultiplier,
    subject: "Storage upkeep",
  },
  tradeRoutes: {
    multiplier: (c) => c.tradeRoutesPriceMultiplier,
    subject: "Export income per ton",
  },
  landSurvey: {
    multiplier: (c) => c.landSurveyCostMultiplier,
    subject: "land preparation cost",
  },
  fertilizerWorks: {
    multiplier: (c) => c.fertilizerWorksCostMultiplier,
    subject: "fertilizer cost",
  },
};

/** The single benefit line for a Technology card, e.g. "50% less Storage upkeep". */
export function technologyBenefit(
  id: TechnologyId,
  config: GameConfig,
): string {
  const { multiplier, subject } = EFFECTS[id];
  const value = multiplier(config);
  if (value === 1) return `No change to ${subject}`;
  const percent = Math.round(Math.abs(value - 1) * 100);
  return `${percent}% ${value < 1 ? "less" : "more"} ${subject}`;
}

export type TechnologyStatusKind =
  "available" | "owned" | "selected" | "unaffordable";

/** A card's state and its status text; available cards show no status. */
export function technologyStatus(card: {
  owned: boolean;
  selected: boolean;
  shortfall: number; // coins still needed after the rest of the plan; <= 0 when affordable
}): { kind: TechnologyStatusKind; text: string } {
  if (card.owned) return { kind: "owned", text: "Owned" };
  if (card.selected) return { kind: "selected", text: "Selected" };
  if (card.shortfall > 1e-8) {
    return {
      kind: "unaffordable",
      text: `Need ${exactCoins(card.shortfall)} more`,
    };
  }
  return { kind: "available", text: "" };
}
