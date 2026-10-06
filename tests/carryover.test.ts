import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { carriedPlan } from "../src/carryover.js";
import type { EventLogEntry } from "../src/persistence.js";
import { eventSummary } from "../src/event-text.js";
import { createNewGame } from "../src/simulation.js";
import { beginTurn, finishTurn, productionCosts } from "../src/turn.js";
import type { GameState, PlayerPlan, TechnologyId } from "../src/types.js";

const plan = (
  cultivatedHectares: number,
  fertilizedHectares: number,
  purchaseTechnologies: TechnologyId[] = [],
): PlayerPlan => ({
  cultivatedHectares,
  fertilizedHectares,
  preparedHectares: 0,
  storeTons: 0,
  purchaseTechnologies,
});

/** Resolve a real Year exactly as the UI does and return its log entry. */
function completedYear(
  state: GameState,
  production: PlayerPlan,
  config = CONFIG,
): EventLogEntry {
  const pending = beginTurn(state, production, 5, config);
  const result = finishTurn(pending, pending.minStoreTons, config);
  return {
    year: result.report.year,
    event: result.report.event,
    summary: eventSummary(result.report),
    cultivatedHectares: production.cultivatedHectares,
    result,
  };
}

describe("carried plan", () => {
  it("keeps today's default for a new run", () => {
    const state = createNewGame(CONFIG);
    expect(carriedPlan(state, undefined, CONFIG)).toEqual({
      cultivatedHectares: 400,
      fertilizedHectares: 0,
    });
  });

  it("repeats the previous Year's cultivation and fertilization", () => {
    const entry = completedYear(createNewGame(CONFIG), plan(400, 400));
    const next = entry.result?.state as GameState;
    expect(carriedPlan(next, entry, CONFIG)).toEqual({
      cultivatedHectares: 400,
      fertilizedHectares: 400,
    });
    expect(carriedPlan(next, entry, CONFIG)).not.toHaveProperty(
      "preparedHectares",
    );
  });

  it("derives fertilization at the rate charged before that Year's purchases", () => {
    const opening = { ...createNewGame(CONFIG), budgetCoins: 20000 };
    const bought = completedYear(opening, plan(300, 250, ["fertilizerWorks"]));
    expect(
      carriedPlan(bought.result?.state as GameState, bought, CONFIG),
    ).toEqual({ cultivatedHectares: 300, fertilizedHectares: 250 });

    const owned = { ...opening, ownedTechnologies: ["fertilizerWorks"] };
    const discounted = completedYear(
      owned as GameState,
      plan(300, 250),
      CONFIG,
    );
    expect(discounted.result?.report.fertilizerCostCoins).toBeLessThan(750);
    expect(
      carriedPlan(discounted.result?.state as GameState, discounted, CONFIG),
    ).toEqual({ cultivatedHectares: 300, fertilizedHectares: 250 });
  });

  it("falls back to recorded seed spending when cultivation was not logged", () => {
    const entry = completedYear(createNewGame(CONFIG), plan(250, 100));
    delete entry.cultivatedHectares;
    expect(
      carriedPlan(entry.result?.state as GameState, entry, CONFIG),
    ).toEqual({ cultivatedHectares: 250, fertilizedHectares: 100 });
  });

  it("clamps to prepared land", () => {
    const entry = completedYear(createNewGame(CONFIG), plan(400, 400));
    const state = {
      ...(entry.result?.state as GameState),
      preparedLandHectares: 150,
    };
    expect(carriedPlan(state, entry, CONFIG)).toEqual({
      cultivatedHectares: 150,
      fertilizedHectares: 150,
    });
  });

  it("drops fertilizer first, then cultivation, to stay within Budget", () => {
    const entry = completedYear(createNewGame(CONFIG), plan(400, 400));
    const next = entry.result?.state as GameState;
    const tight = { ...next, budgetCoins: 1100, storageTons: 0 };
    const fertilizerCut = carriedPlan(tight, entry, CONFIG);
    // 400 ha of seed costs 800; the remaining 300 buys 100 ha of fertilizer.
    expect(fertilizerCut).toEqual({
      cultivatedHectares: 400,
      fertilizedHectares: 100,
    });
    expect(productionCosts(tight, plan(400, 100), CONFIG).affordable).toBe(
      true,
    );

    const poor = { ...next, budgetCoins: 501, storageTons: 0 };
    expect(carriedPlan(poor, entry, CONFIG)).toEqual({
      cultivatedHectares: 250,
      fertilizedHectares: 0,
    });
  });

  it("reserves mandatory upkeep for retained food and handles debt", () => {
    const entry = completedYear(createNewGame(CONFIG), plan(400, 400));
    const next = entry.result?.state as GameState;
    // 1,500 t opening Storage against 1,000 t Consumption retains 500 t.
    const retained = {
      ...next,
      population: 1000,
      budgetCoins: 1300,
      storageTons: 1500,
    };
    const result = carriedPlan(retained, entry, CONFIG);
    const costs = productionCosts(
      retained,
      plan(result.cultivatedHectares, result.fertilizedHectares),
      CONFIG,
    );
    expect(costs.affordable).toBe(true);
    expect(result.cultivatedHectares).toBe(400);
    expect(result.fertilizedHectares).toBeLessThan(400);

    const debt = { ...next, budgetCoins: -50 };
    expect(carriedPlan(debt, entry, CONFIG)).toEqual({
      cultivatedHectares: 0,
      fertilizedHectares: 0,
    });
  });

  it("uses today's default for legacy summary-only entries", () => {
    const state = createNewGame(CONFIG);
    const legacy: EventLogEntry = {
      year: 1,
      event: "none",
      summary: "An ordinary year.",
      cultivatedHectares: 200,
    };
    expect(carriedPlan({ ...state, year: 2 }, legacy, CONFIG)).toEqual({
      cultivatedHectares: 400,
      fertilizedHectares: 0,
    });
  });
});
