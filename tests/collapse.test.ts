import { describe, expect, it } from "vitest";
import { collapseSummary } from "../src/collapse.js";
import { CONFIG } from "../src/config.js";
import { newSave } from "../src/persistence.js";
import type { SaveData } from "../src/persistence.js";
import { createNewGame, eventSummary, resolveTurn } from "../src/simulation.js";
import type { GameState } from "../src/types.js";

// Resolves one Year with the given cultivation (unfertilized) and records it in
// the log exactly as the UI does, so the summary reads the real final outcome.
function collapseAfter(
  cultivatedHectares: number,
  opening: Partial<GameState>,
  runSeed: number,
): SaveData {
  const save = newSave(runSeed);
  save.state = { ...createNewGame(CONFIG), ...opening };
  const result = resolveTurn(
    save.state,
    {
      cultivatedHectares,
      fertilizedHectares: 0,
      preparedHectares: 0,
      storeTons: 0,
    },
    // The UI's per-Turn seed: run seed plus Year.
    runSeed + save.state.year,
    CONFIG,
  );
  save.state = result.state;
  save.eventLog.push({
    year: result.report.year,
    event: result.report.event,
    summary: eventSummary(result.report),
    cultivatedHectares,
    result,
  });
  return save;
}

describe("collapseSummary", () => {
  it("explains a total Famine with the final Year's food figures", () => {
    // Run seed 5 rolls no Event in Year 1.
    const save = collapseAfter(0, {}, 5);
    expect(save.state.collapseCause).toBe("totalFamine");
    expect(collapseSummary(save, CONFIG.startingPopulation)).toEqual({
      cause:
        "Total famine: Harvest 0 t and 0 t stored against 1,000 t needed. No one could be fed, so the population reached zero.",
      event: "",
      runLength: "1 Year",
      score: "1,000",
    });
  });

  it("explains a fall below half the starting population with the final Year's figures", () => {
    const save = collapseAfter(
      100,
      { population: 1277, highestPopulation: 1300, storageTons: 73 },
      5,
    );
    expect(save.state.collapseCause).toBe("belowHalf");
    expect(collapseSummary(save, CONFIG.startingPopulation)).toEqual({
      cause:
        "Partial famine: Harvest 200 t and 73 t stored against 1,277 t needed. Population fell from 1,277 to 273, below half the starting 1,000.",
      event: "",
      runLength: "1 Year",
      score: "1,300",
    });
  });

  it("counts only Storage that survived a flood as stored food", () => {
    // Run seed 43 rolls a flood in Year 1.
    const save = collapseAfter(100, { storageTons: 200 }, 43);
    const report = save.eventLog.at(-1)?.result?.report;
    expect(report?.event).toBe("flood");
    expect(report?.storageDestroyedTons).toBeGreaterThan(0);
    const stored = 200 - (report?.storageDestroyedTons ?? 0);
    const summary = collapseSummary(save, CONFIG.startingPopulation);
    expect(summary.cause).toContain(
      `Harvest ${Math.round(report?.harvestTons ?? 0)} t and ${Math.round(stored)} t stored against 1,000 t needed.`,
    );
    expect(summary.event).toBe(save.eventLog.at(-1)?.summary);
    expect(summary.event).toMatch(/^Flood:/);
  });

  it("falls back to the cause alone when a legacy save has no final outcome", () => {
    const save = newSave(5);
    save.state = {
      ...save.state,
      year: 4,
      population: 300,
      collapsed: true,
      collapseCause: "belowHalf",
    };
    save.eventLog = [
      { year: 3, event: "drought", summary: "Drought: Yield reduced by 50%" },
    ];
    expect(collapseSummary(save, CONFIG.startingPopulation)).toEqual({
      cause: "The population fell below half of the starting 1,000.",
      event: "Drought: Yield reduced by 50%",
      runLength: "3 Years",
      score: "1,000",
    });
    save.state.collapseCause = "totalFamine";
    save.eventLog = [{ year: 3, event: "none", summary: "No event" }];
    expect(collapseSummary(save, CONFIG.startingPopulation)).toMatchObject({
      cause: "Total famine: no food at all, the population reached zero.",
      event: "",
    });
  });
});
