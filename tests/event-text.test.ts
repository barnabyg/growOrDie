import { describe, expect, it } from "vitest";
import { eventIcon, eventLabel, eventSummary } from "../src/event-text.js";
import type { EventType, YearReport } from "../src/types.js";

type EventFields = Pick<
  YearReport,
  | "event"
  | "droughtYieldLossFraction"
  | "storageDestroyedTons"
  | "harvestTons"
  | "exportPriceCoins"
>;

function report(event: EventType, fields: Partial<EventFields> = {}) {
  return {
    event,
    droughtYieldLossFraction: 0,
    storageDestroyedTons: 0,
    harvestTons: 1200,
    exportPriceCoins: 10,
    ...fields,
  };
}

describe("event text", () => {
  it("summarizes each Event with its concrete effect for the event log", () => {
    expect(eventSummary(report("none"))).toBe("No event");
    expect(
      eventSummary(report("drought", { droughtYieldLossFraction: 0.25 })),
    ).toBe("Drought: Yield reduced by 25%, Harvest 1,200 t");
    expect(eventSummary(report("flood", { storageDestroyedTons: 500 }))).toBe(
      "Flood: Yield hit and 500 t of Storage destroyed, Harvest 1,200 t",
    );
    expect(eventSummary(report("priceShock", { exportPriceCoins: 6 }))).toBe(
      "Export price shock: exports sold at 6.00 coins/t",
    );
  });

  it("labels each Event compactly for the chronicle", () => {
    expect(eventLabel(report("none"))).toBe("No event");
    expect(
      eventLabel(report("drought", { droughtYieldLossFraction: 0.25 })),
    ).toBe("Drought: Yield down 25%");
    expect(eventLabel(report("flood", { storageDestroyedTons: 500 }))).toBe(
      "Flood: 500 t of Storage lost",
    );
    expect(eventLabel(report("flood"))).toBe("Flood");
    expect(eventLabel(report("priceShock", { exportPriceCoins: 6 }))).toBe(
      "Export price shock: 6.00 coins/t",
    );
  });

  it("pictures each Event with its icon", () => {
    expect(eventIcon("none")).toBe("sun");
    expect(eventIcon("drought")).toBe("sun");
    expect(eventIcon("flood")).toBe("rain");
    expect(eventIcon("priceShock")).toBe("trade");
  });
});
