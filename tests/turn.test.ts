import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame } from "../src/simulation.js";
import { newSave, parseSave } from "../src/persistence.js";
import { beginTurn, finishTurn } from "../src/turn.js";
const plan = {
  cultivatedHectares: 400,
  fertilizedHectares: 400,
  preparedHectares: 0,
  storeTons: 0,
};
const calm = {
  ...CONFIG,
  eventNothingProbability: 1,
  eventDroughtProbability: 0,
  eventFloodProbability: 0,
  eventPriceShockProbability: 0,
};
it("reveals one durable harvest then allocates without rerolling or mutating", () => {
  const state = createNewGame(CONFIG);
  const pending = beginTurn(state, plan, 0, calm);
  expect(state.year).toBe(1);
  expect(pending.result.report.harvestTons).toBe(1600);
  expect(pending.maxStoreTons).toBe(600);
  const saved = JSON.stringify(pending);
  const final = finishTurn(JSON.parse(saved), 400, calm);
  expect(final.state.year).toBe(2);
  expect(final.report.exportTons).toBe(200);
  expect(final.report.budgetSpentCoins).toBe(2400);
  expect(JSON.stringify(pending)).toBe(saved);
  expect(finishTurn(pending, 400, calm)).toEqual(final);
});
it("caps post-harvest storage at the remaining current budget, not export revenue", () => {
  const pending = beginTurn(
    createNewGame(CONFIG),
    { ...plan, purchaseTechnologies: ["irrigation"] },
    0,
    calm,
  );
  expect(pending.maxStoreTons).toBe(0);
  expect(() => finishTurn(pending, 600, calm)).toThrow("affordable");
  expect(finishTurn(pending, 0, calm).report.budgetCarryOverCoins).toBe(0);
});
it("retains only surviving old food after a flood", () => {
  const config = {
    ...calm,
    eventNothingProbability: 0,
    eventFloodProbability: 1,
  };
  const pending = beginTurn(
    { ...createNewGame(CONFIG), storageTons: 2000 },
    { ...plan, cultivatedHectares: 0, fertilizedHectares: 0 },
    0,
    config,
  );
  expect(pending.minStoreTons).toBe(500);
  expect(pending.maxStoreTons).toBe(500);
  expect(finishTurn(pending, 500, config).report.exportTons).toBe(0);
});
it("reserves mandatory upkeep before accepting production", () => {
  const state = { ...createNewGame(CONFIG), storageTons: 5000 };
  expect(() => beginTurn(state, plan, 0, calm)).toThrow("budget");
  expect(
    beginTurn(
      state,
      { ...plan, cultivatedHectares: 0, fertilizedHectares: 0 },
      0,
      calm,
    ).minStoreTons,
  ).toBe(4000);
});

it("reloads a committed outcome and rejects corruption instead of rerolling", () => {
  const save = newSave(0);
  const pendingTurn = beginTurn(save.state, plan, 1, calm);
  const saved = { ...save, pendingTurn };
  expect(parseSave(JSON.stringify(saved))).toEqual(saved);
  expect(
    parseSave(
      JSON.stringify({
        ...saved,
        pendingTurn: { ...pendingTurn, maxStoreTons: 999999 },
      }),
    ),
  ).toBeNull();
  expect(
    parseSave(
      JSON.stringify({
        ...saved,
        pendingTurn: {
          ...pendingTurn,
          result: {
            ...pendingTurn.result,
            report: { ...pendingTurn.result.report, exportIncomeCoins: -1 },
          },
        },
      }),
    ),
  ).toBeNull();
});

it("freezes storage pricing and checks committed ownership across reload", () => {
  const save = newSave(0);
  const pendingTurn = beginTurn(save.state, plan, 1, calm);
  expect(
    finishTurn(pendingTurn, 400, { ...calm, storageUpkeepPerTonPerYear: 99 }),
  ).toEqual(finishTurn(pendingTurn, 400, calm));
  const corrupt = {
    ...save,
    pendingTurn: {
      ...pendingTurn,
      result: {
        ...pendingTurn.result,
        state: { ...pendingTurn.result.state, ownedTechnologies: ["granary"] },
      },
    },
  };
  expect(parseSave(JSON.stringify(corrupt))).toBeNull();
});
