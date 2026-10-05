import { expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { resourceHeader } from "../src/header.js";
import { newSave } from "../src/persistence.js";
import type { SaveData } from "../src/persistence.js";
import { beginTurn, finishTurn } from "../src/turn.js";

const plan = {
  cultivatedHectares: 400,
  fertilizedHectares: 400,
  preparedHectares: 0,
  storeTons: 0,
  purchaseTechnologies: [],
};

function completeYear(save: SaveData, storeTons: number): void {
  const pending = beginTurn(save.state, plan, 6, CONFIG);
  const result = finishTurn(pending, storeTons, CONFIG);
  save.state = result.state;
  save.eventLog.push({
    year: result.report.year,
    event: result.report.event,
    summary: "",
    result,
  });
}

it("shows the four primary resources with no change before the first Year", () => {
  const header = resourceHeader(newSave(5));
  expect(header).toEqual({
    year: "1",
    population: "1,000",
    populationChange: "",
    storage: "0 t",
    budget: "4,000 coins",
    opening: false,
    status: "Your first Year · plan a Harvest to feed your people",
  });
});

it("reports the latest Population change without repeating the current Year", () => {
  const save = newSave(5);
  completeYear(save, 0);
  const header = resourceHeader(save);
  expect(header.year).toBe("2");
  expect(header.population).toBe("1,050");
  expect(header.populationChange).toBe("+50 last Year");
  expect(header.opening).toBe(false);
  expect(header.status).toBe("Year 1 complete · plan the next Harvest");
});

it("marks opening values once while a Harvest awaits allocation", () => {
  const save = newSave(5);
  save.pendingTurn = beginTurn(save.state, plan, 6, CONFIG);
  const header = resourceHeader(save);
  expect(header.opening).toBe(true);
  expect(header.population).toBe("1,000");
  expect(header.status).toBe(
    "Harvest committed · choose Storage to finish the Year",
  );
  expect(header.status).not.toMatch(/Year \d/);
});

it("shows losses and the end of a run after Collapse", () => {
  const save = newSave(5);
  const pending = beginTurn(
    save.state,
    { ...plan, cultivatedHectares: 0, fertilizedHectares: 0 },
    6,
    CONFIG,
  );
  const result = finishTurn(pending, 0, CONFIG);
  save.state = result.state;
  save.eventLog.push({
    year: 1,
    event: result.report.event,
    summary: "",
    result,
  });
  const header = resourceHeader(save);
  expect(header.year).toBe("1");
  expect(header.population).toBe("0");
  expect(header.populationChange).toBe("-1,000 last Year");
  expect(header.status).toBe(
    "Run complete · start a new country when you're ready",
  );
});
