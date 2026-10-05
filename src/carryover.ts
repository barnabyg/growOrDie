// The production plan each Year opens with: the previous Year's cultivation and
// fertilization, derived from the latest saved outcome and clamped to what the
// current state allows. Pure, so the rules run under vitest without the DOM.
import type { GameConfig } from "./config.js";
import { economyRates } from "./economy.js";
import type { EventLogEntry } from "./persistence.js";
import { productionCosts } from "./turn.js";
import type { GameState } from "./types.js";

export interface CarriedPlan {
  cultivatedHectares: number;
  fertilizedHectares: number;
}

// Tolerates floating-point noise when converting coin totals back to hectares.
const EPSILON = 1e-6;
const wholeHectares = (value: number): number =>
  Math.max(0, Math.floor(value + EPSILON));

/** The previous Year's plan as recorded by its saved outcome, or null when the
 * entry is a legacy summary that cannot tell us without inventing values. */
function previousPlan(
  latest: EventLogEntry | undefined,
  config: GameConfig,
): CarriedPlan | null {
  const result = latest?.result;
  if (!latest || !result) return null;
  const { report } = result;
  let cultivatedHectares = latest.cultivatedHectares;
  if (cultivatedHectares === undefined) {
    if (config.seedCostPerHectare <= 0) return null;
    cultivatedHectares = report.seedCostCoins / config.seedCostPerHectare;
  }
  // Fertilizer was charged at the rate set by Technologies owned at the start of
  // that Year; purchases made during it only applied afterwards.
  const ownedBefore = result.state.ownedTechnologies.filter(
    (id) => !report.technologiesPurchased.includes(id),
  );
  const rate = economyRates(
    { ...result.state, ownedTechnologies: ownedBefore },
    config,
  ).fertilizer;
  const fertilizedHectares =
    rate > 0 ? Math.round(report.fertilizerCostCoins / rate) : 0;
  return {
    cultivatedHectares: Math.round(cultivatedHectares),
    fertilizedHectares,
  };
}

/** Opening values for this Year's production inputs. Without a complete saved
 * outcome (a new run or a legacy summary) this is the long-standing default:
 * cultivate all prepared land, fertilize none. A carried plan is reduced to
 * fit prepared land, then to the Budget left after mandatory Storage upkeep:
 * fertilizer is dropped before cultivation. Preparation and Technologies are
 * never carried. */
export function carriedPlan(
  state: GameState,
  latest: EventLogEntry | undefined,
  config: GameConfig,
): CarriedPlan {
  const previous = previousPlan(latest, config);
  if (!previous)
    return {
      cultivatedHectares: state.preparedLandHectares,
      fertilizedHectares: 0,
    };
  let cultivatedHectares = Math.min(
    previous.cultivatedHectares,
    wholeHectares(state.preparedLandHectares),
  );
  let fertilizedHectares = Math.min(
    previous.fertilizedHectares,
    cultivatedHectares,
  );

  const empty = {
    cultivatedHectares: 0,
    fertilizedHectares: 0,
    preparedHectares: 0,
    storeTons: 0,
  };
  const { retained } = productionCosts(state, empty, config);
  const mandatoryUpkeep = retained * economyRates(state, config).upkeep;
  const available = Math.max(0, state.budgetCoins - mandatoryUpkeep);
  const seedRate = config.seedCostPerHectare;
  const fertilizerRate = economyRates(state, config).fertilizer;
  if (seedRate > 0 && cultivatedHectares * seedRate > available + EPSILON) {
    cultivatedHectares = wholeHectares(available / seedRate);
    fertilizedHectares = 0;
  } else if (fertilizerRate > 0) {
    const left = available - cultivatedHectares * seedRate;
    fertilizedHectares = Math.min(
      fertilizedHectares,
      wholeHectares(left / fertilizerRate),
    );
  }
  return { cultivatedHectares, fertilizedHectares };
}
