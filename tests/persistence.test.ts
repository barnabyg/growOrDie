import { describe, it, expect } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame } from "../src/simulation.js";
import { clearSave, loadSave, newSave, parseSave, persist, SAVE_KEY, SAVE_VERSION } from "../src/persistence.js";
import type { SaveData } from "../src/persistence.js";

// In-memory stand-in for localStorage so the persistence rules are testable without a DOM.
class FakeStorage {
  private entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

// A save mid-run, deliberately far from the baseline, so a round-trip that
// silently reset to defaults would be obvious.
function midRunSave(): SaveData {
  return {
    version: SAVE_VERSION,
    runSeed: 987_654_321,
    state: {
      year: 7,
      population: 1_234,
      highestPopulation: 1_500,
      collapsed: false,
      collapseCause: null,
      arableLandHectares: 2_600,
      preparedLandHectares: 900,
      storageTons: 320,
      budgetCoins: 5_150,
      worldPrice: 11.5,
      ownedTechnologies: ["irrigation", "granary"],
    },
    eventLog: [
      { year: 2, event: "drought", summary: "Drought: Harvest hit by 50%." },
      { year: 6, event: "none", summary: "A quiet year." },
    ],
  };
}

function parseStringified(save: SaveData): SaveData | null {
  return parseSave(JSON.stringify(save));
}

describe("parseSave", () => {
  it("returns null when there is no save at all", () => {
    expect(parseSave(null)).toBeNull();
  });

  it("returns null for invalid JSON instead of crashing", () => {
    expect(parseSave("{ this is not json")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseSave('"a string"')).toBeNull();
    expect(parseSave("42")).toBeNull();
    expect(parseSave("null")).toBeNull();
  });

  it("returns null on a version mismatch", () => {
    const save = midRunSave();
    save.version = 2;
    expect(parseStringified(save)).toBeNull();
  });

  it("returns null when runSeed is missing or not a finite number", () => {
    for (const bad of ["banana", null, undefined]) {
      const raw: Record<string, unknown> = JSON.parse(JSON.stringify(midRunSave()));
      if (bad === undefined) delete raw.runSeed;
      else raw.runSeed = bad;
      expect(parseSave(JSON.stringify(raw))).toBeNull();
    }
  });

  it("returns null when the state is missing", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(midRunSave()));
    delete raw.state;
    expect(parseSave(JSON.stringify(raw))).toBeNull();
  });

  it("returns null when any numeric field is corrupted or missing", () => {
    const fields = ["year", "population", "arableLandHectares", "preparedLandHectares", "storageTons", "budgetCoins", "worldPrice"] as const;
    for (const field of fields) {
      for (const bad of ["banana", null]) {
        const raw = JSON.parse(JSON.stringify(midRunSave()));
        raw.state[field] = bad;
        expect(parseSave(JSON.stringify(raw)), `${field}=${String(bad)}`).toBeNull();
      }
      const missing = JSON.parse(JSON.stringify(midRunSave()));
      delete missing.state[field];
      expect(parseSave(JSON.stringify(missing)), `${field} missing`).toBeNull();
    }
  });

  it("returns null when a numeric field is NaN (JSON serializes it as null)", () => {
    const save = midRunSave();
    save.state.population = Number.NaN;
    expect(parseStringified(save)).toBeNull();
  });

  it("round-trips a full mid-run save intact", () => {
    expect(parseStringified(midRunSave())).toEqual(midRunSave());
  });

  it("loads legacy saves written before the event log existed", () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(midRunSave()));
    delete raw.eventLog;
    const loaded = parseSave(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    expect(loaded?.eventLog).toEqual([]);
  });

  it("loads legacy saves written before Technologies and Score existed", () => {
    const raw = JSON.parse(JSON.stringify(midRunSave()));
    delete raw.state.ownedTechnologies;
    delete raw.state.highestPopulation;
    const loaded = parseSave(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    expect(loaded?.state.ownedTechnologies).toEqual([]);
    expect(loaded?.state.highestPopulation).toBe(midRunSave().state.population);
  });

  it("drops malformed event log entries but keeps the run", () => {
    const raw = JSON.parse(JSON.stringify(midRunSave()));
    raw.eventLog.push(
      "garbage",
      { year: 3, summary: "missing event" },
      { year: 4, event: "plague", summary: "unknown event" },
      { year: 5, event: "flood", summary: 42 },
    );
    const loaded = parseSave(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    expect(loaded?.eventLog).toEqual([
      { year: 2, event: "drought", summary: "Drought: Harvest hit by 50%." },
      { year: 6, event: "none", summary: "A quiet year." },
    ]);
  });

  it("returns null when eventLog is present but not an array", () => {
    const raw = JSON.parse(JSON.stringify(midRunSave()));
    raw.eventLog = "banana";
    expect(parseSave(JSON.stringify(raw))).toBeNull();
  });

  it("returns null when ownedTechnologies holds an unknown Technology", () => {
    const save = midRunSave();
    (save.state.ownedTechnologies as string[]).push("timeMachine");
    expect(parseStringified(save)).toBeNull();
  });

  it("coerces collapsed and collapseCause from legacy or corrupted values", () => {
    const raw = JSON.parse(JSON.stringify(midRunSave()));
    raw.state.collapsed = "yes";
    raw.state.collapseCause = "plague";
    const loaded = parseSave(JSON.stringify(raw));
    expect(loaded?.state.collapsed).toBe(false);
    expect(loaded?.state.collapseCause).toBeNull();

    const collapsedRaw = JSON.parse(JSON.stringify(midRunSave()));
    collapsedRaw.state.population = 0;
    collapsedRaw.state.collapsed = true;
    collapsedRaw.state.collapseCause = "totalFamine";
    const collapsed = parseSave(JSON.stringify(collapsedRaw));
    expect(collapsed?.state.collapsed).toBe(true);
    expect(collapsed?.state.collapseCause).toBe("totalFamine");
  });
});

describe("newSave", () => {
  it("creates a fresh v1 save at the baseline with an empty event log", () => {
    const save = newSave();
    expect(save.version).toBe(SAVE_VERSION);
    expect(Number.isFinite(save.runSeed)).toBe(true);
    expect(save.state).toEqual(createNewGame(CONFIG));
    expect(save.eventLog).toEqual([]);
  });

  it("uses the provided run seed when given", () => {
    expect(newSave(42).runSeed).toBe(42);
  });
});

describe("storage wrappers", () => {
  it("persist writes under the save key and loadSave reads it back", () => {
    const storage = new FakeStorage();
    const save = midRunSave();
    persist(save, storage);
    expect(storage.getItem(SAVE_KEY)).toBe(JSON.stringify(save));
    expect(loadSave(storage)).toEqual(save);
  });

  it("loadSave returns null on empty or corrupted storage", () => {
    const storage = new FakeStorage();
    expect(loadSave(storage)).toBeNull();
    storage.setItem(SAVE_KEY, "{ corrupted");
    expect(loadSave(storage)).toBeNull();
  });

  it("clearSave removes the save", () => {
    const storage = new FakeStorage();
    persist(midRunSave(), storage);
    clearSave(storage);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(loadSave(storage)).toBeNull();
  });
});
