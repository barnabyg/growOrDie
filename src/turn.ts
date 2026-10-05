import type { GameConfig } from "./config.js";
import type {
  GameState,
  PendingTurn,
  PlayerPlan,
  TurnResult,
} from "./types.js";
import { economyRates, isAffordable, planCosts } from "./economy.js";
import { resolveTurn } from "./simulation.js";

/** Reserve the worst-case unavoidable bill before revealing the event. A flood
 * can destroy reserves, but can never increase this minimum retained quantity. */
export function productionCosts(
  state: GameState,
  plan: PlayerPlan,
  config: GameConfig,
) {
  const retained = Math.max(
    0,
    state.storageTons - state.population * config.consumptionPerPerson,
  );
  const costs = planCosts(state, plan, retained, config);
  return {
    ...costs,
    retained,
    affordable: isAffordable(state, costs, retained, config),
  };
}

export type ProductionInput =
  "cultivatedHectares" | "fertilizedHectares" | "preparedHectares";

/** Largest whole hectares for one production input that keeps the plan within
 * Budget, holding the other choices fixed (reduced cultivation also limits
 * fertilization, as in the plan controls). It is capped by the land available
 * to that input and is 0 when the rest of the plan is already unaffordable. */
export function affordableHectares(
  state: GameState,
  plan: PlayerPlan,
  input: ProductionInput,
  config: GameConfig,
): number {
  const limit = Math.floor(
    input === "cultivatedHectares"
      ? state.preparedLandHectares
      : input === "fertilizedHectares"
        ? plan.cultivatedHectares
        : state.arableLandHectares - state.preparedLandHectares,
  );
  const fits = (hectares: number) =>
    productionCosts(
      state,
      {
        ...plan,
        [input]: hectares,
        ...(input === "cultivatedHectares" && {
          fertilizedHectares: Math.min(plan.fertilizedHectares, hectares),
        }),
      },
      config,
    ).affordable;
  if (limit <= 0 || !fits(0)) return 0;
  // Spending only grows with hectares, so search for the affordable boundary.
  let low = 0;
  let high = limit;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function beginTurn(
  state: GameState,
  plan: PlayerPlan,
  seed: number,
  config: GameConfig,
): PendingTurn {
  if (state.collapsed) throw new Error("This run has collapsed");
  if (!productionCosts(state, plan, config).affordable)
    throw new Error("Plan exceeds available budget including mandatory upkeep");
  const committedPlan = {
    ...plan,
    purchaseTechnologies: [...(plan.purchaseTechnologies ?? [])],
    storeTons: 0,
  };
  const result = resolveTurn(state, committedPlan, seed, config);
  const minStoreTons = result.state.storageTons;
  const surplus = Math.max(
    0,
    result.report.availableFoodTons - result.report.consumptionTons,
  );
  const rate = economyRates(state, config).upkeep;
  const remaining = Math.max(
    0,
    state.budgetCoins - result.report.budgetSpentCoins,
  );
  const maxStoreTons =
    rate > 0 ? Math.min(surplus, minStoreTons + remaining / rate) : surplus;
  return {
    plan: committedPlan,
    result,
    storageUpkeepPerTon: rate,
    minStoreTons,
    maxStoreTons,
  };
}

/** Allocation is pure arithmetic over the durable outcome; it never draws RNG. */
export function finishTurn(
  pending: PendingTurn,
  storeTons: number,
  _config: GameConfig,
): TurnResult {
  if (
    !Number.isFinite(storeTons) ||
    storeTons < pending.minStoreTons ||
    storeTons > pending.maxStoreTons + 1e-8
  )
    throw new Error("Storage allocation is outside affordable bounds");
  const { state, report } = pending.result;
  const additionalStorage = storeTons - pending.minStoreTons;
  const extraUpkeep = additionalStorage * pending.storageUpkeepPerTon;
  const lostExports = additionalStorage * report.exportPriceCoins;
  return {
    state: {
      ...state,
      storageTons: storeTons,
      budgetCoins: state.budgetCoins - extraUpkeep - lostExports,
    },
    report: {
      ...report,
      storageUpkeepCoins: report.storageUpkeepCoins + extraUpkeep,
      exportTons: Math.max(0, report.exportTons - additionalStorage),
      exportIncomeCoins: Math.max(0, report.exportIncomeCoins - lostExports),
      budgetSpentCoins: report.budgetSpentCoins + extraUpkeep,
      budgetCarryOverCoins: report.budgetCarryOverCoins - extraUpkeep,
      budgetRevenueCoins: report.budgetRevenueCoins - lostExports,
    },
  };
}
