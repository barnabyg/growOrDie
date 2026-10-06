import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { newSave } from "../src/persistence.js";
import type { SaveData } from "../src/persistence.js";
import { restartWarning } from "../src/restart.js";
import { beginTurn, finishTurn } from "../src/turn.js";

const plan = {
  cultivatedHectares: 400,
  fertilizedHectares: 400,
  preparedHectares: 0,
  storeTons: 0,
  purchaseTechnologies: [],
};

function completeYear(save: SaveData): void {
  const pending = beginTurn(save.state, plan, 6, CONFIG);
  const result = finishTurn(pending, 0, CONFIG);
  save.state = result.state;
  save.eventLog.push({
    year: result.report.year,
    event: result.report.event,
    summary: "",
    result,
  });
}

it("states that a fresh run will be replaced", () => {
  expect(restartWarning(newSave(5))).toBe(
    "Your current run (Year 1, Population 1,000) will be replaced by a new run starting at Year 1. This cannot be undone.",
  );
});

it("names the chronicle that will be cleared", () => {
  const save = newSave(5);
  completeYear(save);
  completeYear(save);
  expect(restartWarning(save)).toBe(
    "Your current run (Year 3, Population 1,103) will be replaced by a new run starting at Year 1. Its chronicle of 2 Years will be cleared. This cannot be undone.",
  );
});

it("warns that a Harvest awaiting allocation will be discarded", () => {
  const save = newSave(5);
  save.pendingTurn = beginTurn(save.state, plan, 6, CONFIG);
  expect(restartWarning(save)).toContain(
    "The Harvest awaiting allocation will be discarded.",
  );
});

it("uses the final Year played for a Collapsed run", () => {
  const save = newSave(5);
  save.state = { ...save.state, year: 4, population: 0, collapsed: true };
  expect(restartWarning(save)).toContain("(Year 3, Population 0)");
});

it("names the final Year played after Collapse", () => {
  const save = newSave(5);
  const pending = beginTurn(
    save.state,
    { ...plan, cultivatedHectares: 0, fertilizedHectares: 0 },
    6,
    CONFIG,
  );
  save.state = finishTurn(pending, 0, CONFIG).state;
  expect(save.state.collapsed).toBe(true);
  expect(restartWarning(save)).toContain("(Year 1, Population 0)");
});
