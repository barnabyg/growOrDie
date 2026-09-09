import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";
import { isAffordable, planCosts } from "../src/economy.js";
const calm = {
  ...CONFIG,
  eventNothingProbability: 1,
  eventDroughtProbability: 0,
  eventFloodProbability: 0,
  eventPriceShockProbability: 0,
};
it("blocks the 4600-coin commitment against 4000 including upkeep", () => {
  const state = createNewGame(CONFIG);
  const plan = {
    cultivatedHectares: 400,
    fertilizedHectares: 400,
    preparedHectares: 0,
    storeTons: 600,
    purchaseTechnologies: ["irrigation" as const],
  };
  const costs = planCosts(state, plan, 600, CONFIG);
  expect(costs.total).toBe(4600);
  expect(isAffordable(state, costs, 0, CONFIG)).toBe(false);
  expect(() => resolveTurn(state, plan, 1, calm)).toThrow("budget");
});
it("permits mandatory retained food and zero spending to recover legacy debt", () => {
  const state = {
    ...createNewGame(CONFIG),
    budgetCoins: -600,
    storageTons: 2000,
  };
  const result = resolveTurn(
    state,
    {
      cultivatedHectares: 0,
      fertilizedHectares: 0,
      preparedHectares: 0,
      storeTons: 1000,
    },
    1,
    calm,
  );
  expect(result.state.storageTons).toBe(1000);
  expect(result.report.budgetSpentCoins).toBe(1000);
  expect(result.state.budgetCoins).toBeGreaterThan(state.budgetCoins);
});
