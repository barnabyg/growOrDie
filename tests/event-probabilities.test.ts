import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame, resolveTurn } from "../src/simulation.js";

const plan = {
  cultivatedHectares: 400,
  fertilizedHectares: 400,
  preparedHectares: 0,
  storeTons: 0,
};
it.each([Number.NaN, Infinity, -0.1, 0, 0.2])(
  "rejects an invalid price shock probability %s",
  (eventPriceShockProbability) => {
    const config = { ...CONFIG, eventPriceShockProbability };
    expect(() => resolveTurn(createNewGame(CONFIG), plan, 4, config)).toThrow(
      /probabilit/i,
    );
  },
);

it.each(["none", "drought", "flood", "priceShock"] as const)(
  "supports 100%% %s with zero probability for every other event",
  (event) => {
    const config = {
      ...CONFIG,
      eventNothingProbability: event === "none" ? 1 : 0,
      eventDroughtProbability: event === "drought" ? 1 : 0,
      eventFloodProbability: event === "flood" ? 1 : 0,
      eventPriceShockProbability: event === "priceShock" ? 1 : 0,
    };
    for (let seed = 0; seed < 100; seed++) {
      expect(
        resolveTurn(createNewGame(config), plan, seed, config).report.event,
      ).toBe(event);
    }
  },
);
