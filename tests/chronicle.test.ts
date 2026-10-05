import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config.js";
import { createNewGame } from "../src/simulation.js";
import { chronicleRows, UNKNOWN } from "../src/chronicle.js";
import type { EventLogEntry } from "../src/persistence.js";
import type { EventType, YearReport } from "../src/types.js";

function detailed(
  year: number,
  event: EventType,
  report: Partial<YearReport> = {},
  state: { budgetCoins?: number; collapsed?: boolean } = {},
): EventLogEntry {
  const base = createNewGame(CONFIG);
  return {
    year,
    event,
    summary: "Stored summary",
    result: {
      state: { ...base, year: year + 1, budgetCoins: 3200, ...state },
      report: {
        year,
        event,
        harvestTons: 1600,
        droughtYieldLossFraction: 0,
        consumptionTons: 1000,
        availableFoodTons: 1600,
        famine: "none",
        populationStart: 1000,
        populationEnd: 1050,
        milestoneLevel: null,
        seedCostCoins: 0,
        fertilizerCostCoins: 0,
        landPrepCostCoins: 0,
        storageUpkeepCoins: 0,
        technologiesPurchased: [],
        technologyCostCoins: 0,
        storageDestroyedTons: 0,
        exportTons: 600,
        exportPriceCoins: 10,
        exportIncomeCoins: 6000,
        budgetSpentCoins: 2000,
        budgetRevenueCoins: 7000,
        budgetCarryOverCoins: 2000,
        ...report,
      },
    },
  };
}

describe("Country chronicle rows", () => {
  it("lists the newest Year first", () => {
    const rows = chronicleRows([
      detailed(1, "none"),
      detailed(2, "none"),
      detailed(3, "none"),
    ]);
    expect(rows.map((row) => row.year)).toEqual(["3", "2", "1"]);
  });

  it("summarises a detailed Year as Event, Harvest, Population change and Budget", () => {
    const [row] = chronicleRows([detailed(1, "none")]);
    expect(row).toEqual({
      year: "1",
      event: "No event",
      eventType: "none",
      harvest: "1,600 t",
      population: "+50 to 1,050",
      famine: null,
      budget: "3,200 coins",
      detailed: true,
    });
  });

  it("names each Event briefly without repeating the Harvest", () => {
    const rows = chronicleRows([
      detailed(1, "drought", { droughtYieldLossFraction: 0.25 }),
      detailed(2, "flood", { storageDestroyedTons: 500 }),
      detailed(3, "flood"),
      detailed(4, "priceShock", { exportPriceCoins: 6 }),
    ]);
    expect(rows.map((row) => row.event)).toEqual([
      "Export price shock: 6.00 coins/t",
      "Flood",
      "Flood: 500 t of Storage lost",
      "Drought: Yield down 25%",
    ]);
  });

  it("marks Famine Years in text, with population losses signed", () => {
    const [total, partial] = chronicleRows([
      detailed(1, "none", {
        famine: "partial",
        populationStart: 1000,
        populationEnd: 900,
      }),
      detailed(
        2,
        "none",
        { famine: "total", populationStart: 900, populationEnd: 0 },
        { collapsed: true, budgetCoins: 1 },
      ),
    ]);
    expect(partial).toMatchObject({
      population: "-100 to 900",
      famine: "Partial famine",
    });
    expect(total).toMatchObject({
      population: "-900 to 0",
      famine: "Total famine · Collapse",
      budget: "1 coin",
    });
  });

  it("shows an unchanged population without a sign", () => {
    const [row] = chronicleRows([
      detailed(1, "none", { populationStart: 1000, populationEnd: 1000 }),
    ]);
    expect(row?.population).toBe("0 to 1,000");
  });

  it("keeps a legacy summary-only entry to what it recorded", () => {
    const legacy: EventLogEntry = {
      year: 4,
      event: "drought",
      summary: "Drought: Yield reduced by 25%, Harvest 1,200 t",
      cultivatedHectares: 400,
    };
    const rows = chronicleRows([legacy, detailed(5, "none")]);
    expect(rows[1]).toEqual({
      year: "4",
      event: "Drought: Yield reduced by 25%, Harvest 1,200 t",
      eventType: "drought",
      harvest: UNKNOWN,
      population: UNKNOWN,
      famine: null,
      budget: UNKNOWN,
      detailed: false,
    });
  });

  it("returns no rows for an empty log", () => {
    expect(chronicleRows([])).toEqual([]);
  });
});
