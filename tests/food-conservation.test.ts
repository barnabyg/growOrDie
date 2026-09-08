import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";

describe("flood food conservation (#10)", () => {
  it.each([0, 100, 400])("retains only surviving opening storage with %i cultivated hectares", (cultivatedHectares) => {
    const opening = { ...createNewGame(CONFIG), storageTons: 2_000 };
    const result = resolveTurn(opening, { cultivatedHectares, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 30, CONFIG);
    expect(result.report.event).toBe("flood");
    expect(result.report.storageDestroyedTons).toBe(500);
    expect(result.state.storageTons).toBe(500);
    expect(result.report.exportTons).toBe(result.report.harvestTons);
    expect(result.report.exportIncomeCoins).toBeGreaterThanOrEqual(0);
    expect(result.state.storageTons + result.report.exportTons + result.report.consumptionTons + result.report.storageDestroyedTons)
      .toBe(opening.storageTons + result.report.harvestTons);
  });
});
