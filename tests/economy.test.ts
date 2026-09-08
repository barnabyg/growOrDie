import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { economyRates, planCosts } from "../src/economy.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";

describe("shared economy estimates", () => {
  it("matches resolution for owned discounts and trade bonus", () => {
    const state = { ...createNewGame(CONFIG), budgetCoins: 20000, ownedTechnologies: ["landSurvey", "fertilizerWorks", "granary", "tradeRoutes"] as const };
    const mutable = { ...state, ownedTechnologies: [...state.ownedTechnologies] };
    const plan = { cultivatedHectares: 400, fertilizedHectares: 400, preparedHectares: 100, storeTons: 100 };
    const costs = planCosts(mutable, plan, 100, CONFIG);
    const { report } = resolveTurn(mutable, plan, 12345, { ...CONFIG, eventNothingProbability: 1, eventDroughtProbability: 0, eventFloodProbability: 0, eventPriceShockProbability: 0 });
    expect(costs.preparation).toBe(3000);
    expect(report.budgetSpentCoins).toBe(costs.total);
    expect(report.exportPriceCoins).toBe(state.worldPrice * economyRates(mutable, CONFIG).trade);
  });
  it("does not apply newly purchased discounts until the next year", () => {
    const state = createNewGame(CONFIG);
    const plan = { cultivatedHectares: 0, fertilizedHectares: 0, preparedHectares: 100, storeTons: 0, purchaseTechnologies: ["landSurvey" as const, "landSurvey" as const] };
    expect(planCosts(state, plan, 0, CONFIG).preparation).toBe(6000);
    expect(planCosts(state, plan, 0, CONFIG).technologies).toBe(CONFIG.technologyCosts.landSurvey);
  });
});

