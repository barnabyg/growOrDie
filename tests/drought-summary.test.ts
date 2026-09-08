import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, eventSummary, resolveTurn } from "../src/simulation.js";

it.each([
  [false, 0.5, 50, 400],
  [true, 0.5, 25, 600],
  [true, 0.2, 40, 480],
] as const)("reports actual drought loss (irrigation %s, multiplier %s)", (irrigation, droughtYieldMultiplier, loss, harvest) => {
  const state = createNewGame(CONFIG);
  if (irrigation) state.ownedTechnologies = ["irrigation"];
  const { report } = resolveTurn(state, { cultivatedHectares: 400, fertilizedHectares: 0, preparedHectares: 0, storeTons: 0 }, 1, { ...CONFIG, droughtYieldMultiplier });
  expect(report.harvestTons).toBe(harvest);
  expect(eventSummary(report)).toBe(`Drought: Yield reduced by ${loss}%, Harvest ${harvest} t`);
});
