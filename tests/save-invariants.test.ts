import { describe, expect, it } from "vitest";
import { newSave, parseSave } from "../src/persistence.js";

describe("saved game invariants", () => {
  it.each([
    ["year", 0],
    ["year", 1.5],
    ["year", -1],
    ["population", -100],
    ["arableLandHectares", -1],
    ["preparedLandHectares", -1],
    ["preparedLandHectares", 3000],
    ["storageTons", -1],
    ["worldPrice", -1],
  ])("rejects impossible %s=%s", (field, value) => {
    const save = newSave(42);
    const state = { ...save.state, [field]: value };
    expect(parseSave(JSON.stringify({ ...save, state }))).toBeNull();
  });

  it("recovers Score from the current population when legacy Score is missing", () => {
    const save = newSave(42);
    const state = {
      ...save.state,
      population: 1500,
      highestPopulation: undefined,
    };
    expect(
      parseSave(JSON.stringify({ ...save, state }))?.state.highestPopulation,
    ).toBe(1500);
  });

  it.each([0, 400, 500, 1200])(
    "derives Collapse consistently at population %s",
    (population) => {
      const save = newSave(42);
      const state = {
        ...save.state,
        population,
        collapsed: population >= 500,
        collapseCause: "totalFamine",
      };
      const loaded = parseSave(JSON.stringify({ ...save, state }));
      expect(loaded?.state.collapsed).toBe(population < 500);
      expect(loaded?.state.collapseCause).toBe(
        population === 0
          ? "totalFamine"
          : population < 500
            ? "belowHalf"
            : null,
      );
    },
  );

  it("keeps old debt and balance values outside today's configured range readable", () => {
    const save = newSave(42);
    save.state.budgetCoins = -600;
    save.state.worldPrice = 25;
    save.state.arableLandHectares = 3000;
    save.state.preparedLandHectares = 2500;
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });
});
