import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";

describe("flood food conservation (#10)", () => {
  it("retains only surviving storage after the issue #10 flood", () => {
    const opening = { ...createNewGame(CONFIG), storageTons: 2000 };
    const { state, report } = resolveTurn(
      opening,
      {
        cultivatedHectares: 0,
        fertilizedHectares: 0,
        preparedHectares: 0,
        storeTons: 0,
      },
      30,
      CONFIG,
    );
    expect(report.event).toBe("flood");
    expect(report.storageDestroyedTons).toBe(500);
    expect(report.availableFoodTons).toBe(1500);
    expect(report.consumptionTons).toBe(1000);
    expect(state.storageTons).toBe(500);
    expect(report.exportTons).toBe(0);
    expect(report.exportIncomeCoins).toBe(0);
    expect(report.storageUpkeepCoins).toBe(
      500 * CONFIG.storageUpkeepPerTonPerYear,
    );
    expect(state.budgetCoins).toBe(
      opening.budgetCoins - report.budgetSpentCoins + report.budgetRevenueCoins,
    );
  });

  it.each([0, 500, 1000, 1500, 2000, 4000])(
    "conserves food and revenue with %i t opening storage during floods",
    (storageTons) => {
      for (const cultivatedHectares of [0, 200, 400]) {
        for (const storeTons of [0, 100, 10000]) {
          const opening = { ...createNewGame(CONFIG), storageTons };
          const { state, report } = resolveTurn(
            opening,
            {
              cultivatedHectares,
              fertilizedHectares: 0,
              preparedHectares: 0,
              storeTons,
            },
            30,
            CONFIG,
          );
          expect(report.event).toBe("flood");
          const surviving = storageTons - report.storageDestroyedTons;
          const surplus = Math.max(
            0,
            surviving + report.harvestTons - report.consumptionTons,
          );
          expect(state.storageTons).toBeGreaterThanOrEqual(0);
          expect(report.exportTons).toBeGreaterThanOrEqual(0);
          expect(state.storageTons + report.exportTons).toBeCloseTo(surplus);
          expect(state.storageTons).toBeGreaterThanOrEqual(
            Math.max(0, surviving - report.consumptionTons),
          );
          expect(report.exportTons).toBeLessThanOrEqual(report.harvestTons);
          expect(report.exportIncomeCoins).toBe(
            report.exportTons * report.exportPriceCoins,
          );
          expect(report.budgetRevenueCoins).toBe(
            state.population * CONFIG.taxPerPerson + report.exportIncomeCoins,
          );
          expect(state.budgetCoins).toBe(
            report.budgetCarryOverCoins + report.budgetRevenueCoins,
          );
          if (report.famine !== "none") {
            expect(state.storageTons).toBe(0);
            expect(report.exportTons).toBe(0);
          }
        }
      }
    },
  );

  it.each([0, 100, 400])(
    "retains only surviving opening storage with %i cultivated hectares",
    (cultivatedHectares) => {
      const opening = { ...createNewGame(CONFIG), storageTons: 2_000 };
      const result = resolveTurn(
        opening,
        {
          cultivatedHectares,
          fertilizedHectares: 0,
          preparedHectares: 0,
          storeTons: 0,
        },
        30,
        CONFIG,
      );
      expect(result.report.event).toBe("flood");
      expect(result.report.storageDestroyedTons).toBe(500);
      expect(result.state.storageTons).toBe(500);
      expect(result.report.exportTons).toBe(result.report.harvestTons);
      expect(result.report.exportIncomeCoins).toBeGreaterThanOrEqual(0);
      expect(
        result.state.storageTons +
          result.report.exportTons +
          result.report.consumptionTons +
          result.report.storageDestroyedTons,
      ).toBe(opening.storageTons + result.report.harvestTons);
    },
  );
});
