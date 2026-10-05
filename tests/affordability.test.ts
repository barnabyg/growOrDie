import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";
import { isAffordable, planCosts } from "../src/economy.js";
import { affordableHectares, productionCosts } from "../src/turn.js";
import type { PlayerPlan } from "../src/types.js";
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
describe("affordable hectares for one production input", () => {
  const year1 = createNewGame(CONFIG);
  const suggested: PlayerPlan = {
    cultivatedHectares: 400,
    fertilizedHectares: 400,
    preparedHectares: 0,
    storeTons: 0,
  };
  const empty = { ...suggested, cultivatedHectares: 0, fertilizedHectares: 0 };
  it("keeps the other choices and fits the remaining Budget", () => {
    expect(
      affordableHectares(year1, suggested, "preparedHectares", CONFIG),
    ).toBe(33);
    expect(
      affordableHectares(year1, suggested, "cultivatedHectares", CONFIG),
    ).toBe(400);
    expect(
      affordableHectares(year1, suggested, "fertilizedHectares", CONFIG),
    ).toBe(400);
  });
  it("returns zero when the rest of the plan already exceeds the Budget", () => {
    const plan = { ...suggested, preparedHectares: 100 };
    expect(affordableHectares(year1, plan, "cultivatedHectares", CONFIG)).toBe(
      0,
    );
    expect(affordableHectares(year1, plan, "fertilizedHectares", CONFIG)).toBe(
      0,
    );
    expect(affordableHectares(year1, plan, "preparedHectares", CONFIG)).toBe(
      33,
    );
  });
  it("lets fertilization fall with reduced cultivation", () => {
    const plan = { ...suggested, preparedHectares: 60 };
    expect(affordableHectares(year1, plan, "cultivatedHectares", CONFIG)).toBe(
      80,
    );
    const at = { ...plan, cultivatedHectares: 80, fertilizedHectares: 80 };
    const over = { ...plan, cultivatedHectares: 81, fertilizedHectares: 81 };
    expect(productionCosts(year1, at, CONFIG).affordable).toBe(true);
    expect(productionCosts(year1, over, CONFIG).affordable).toBe(false);
  });
  it("is limited by available land", () => {
    const rich = { ...year1, budgetCoins: 1_000_000 };
    const plan = { ...suggested, cultivatedHectares: 250 };
    expect(affordableHectares(rich, plan, "cultivatedHectares", CONFIG)).toBe(
      400,
    );
    expect(affordableHectares(rich, plan, "fertilizedHectares", CONFIG)).toBe(
      250,
    );
    expect(affordableHectares(rich, plan, "preparedHectares", CONFIG)).toBe(
      1600,
    );
  });
  it("reserves mandatory upkeep and includes Technology purchases and discounts", () => {
    const stocked = { ...year1, storageTons: 2000 };
    expect(affordableHectares(stocked, empty, "preparedHectares", CONFIG)).toBe(
      50,
    );
    const buying = { ...empty, purchaseTechnologies: ["irrigation" as const] };
    expect(affordableHectares(year1, buying, "preparedHectares", CONFIG)).toBe(
      33,
    );
    const surveyed = { ...year1, ownedTechnologies: ["landSurvey" as const] };
    expect(
      affordableHectares(surveyed, empty, "preparedHectares", CONFIG),
    ).toBe(133);
  });
  it("matches the Resolve gate exactly at the boundary", () => {
    for (const budgetCoins of [1234, 2500, 3999]) {
      const state = { ...year1, budgetCoins };
      const max = affordableHectares(state, empty, "preparedHectares", CONFIG);
      const at = { ...empty, preparedHectares: max };
      const over = { ...empty, preparedHectares: max + 1 };
      expect(productionCosts(state, at, CONFIG).affordable).toBe(true);
      expect(productionCosts(state, over, CONFIG).affordable).toBe(false);
    }
  });
});
