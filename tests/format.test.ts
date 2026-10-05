import { describe, expect, it } from "vitest";
import {
  coinRate,
  coins,
  exactCoins,
  exactTons,
  famineLabel,
  formatCount,
  formatDecimal,
  hectares,
  tons,
  years,
} from "../src/format.js";

describe("player-facing formatter", () => {
  it("rounds counts and groups thousands", () => {
    expect(formatCount(1234.6)).toBe("1,235");
    expect(formatCount(-1500)).toBe("-1,500");
    expect(formatCount(0)).toBe("0");
  });

  it("keeps meaningful decimals for multipliers and prices", () => {
    expect(formatDecimal(1.75)).toBe("1.75");
    expect(formatDecimal(1500.5)).toBe("1,500.5");
    expect(formatDecimal(2)).toBe("2");
  });

  it("pluralizes coins by the displayed value", () => {
    expect(coins(1)).toBe("1 coin");
    expect(coins(1.2)).toBe("1 coin");
    expect(coins(0)).toBe("0 coins");
    expect(coins(2)).toBe("2 coins");
    expect(coins(3200)).toBe("3,200 coins");
    expect(coins(-1)).toBe("-1 coin");
    expect(exactCoins(1.5)).toBe("1.5 coins");
    expect(exactCoins(1)).toBe("1 coin");
    expect(exactCoins(6000)).toBe("6,000 coins");
  });

  it("formats tons and hectares with abbreviated units", () => {
    expect(tons(1600)).toBe("1,600 t");
    expect(tons(1)).toBe("1 t");
    expect(hectares(400.4)).toBe("400 ha");
    expect(exactTons(512.5)).toBe("512.5 t");
    expect(exactTons(1500)).toBe("1,500 t");
  });

  it("formats per-unit rates that read naturally", () => {
    expect(coinRate(1, "t")).toBe("1 coin/t");
    expect(coinRate(0.5, "t")).toBe("0.5 coins/t");
    expect(coinRate(1.8, "ha")).toBe("1.8 coins/ha");
    expect(coinRate(60, "ha")).toBe("60 coins/ha");
    expect(coinRate(10, "t", 2)).toBe("10.00 coins/t");
    expect(coinRate(1, "t", 2)).toBe("1.00 coins/t");
    expect(coinRate(12.345, "t", 2)).toBe("12.35 coins/t");
  });

  it("describes Famine in plain language", () => {
    expect(famineLabel("none")).toBe("No famine");
    expect(famineLabel("partial")).toBe("Partial famine");
    expect(famineLabel("total")).toBe("Total famine");
  });

  it("counts Years for run lengths", () => {
    expect(years(1)).toBe("1 Year");
    expect(years(6)).toBe("6 Years");
    expect(years(0)).toBe("0 Years");
  });
});
