import { describe, expect, it } from "vitest";
import { finishButton, resolveButton } from "../src/commit.js";

const ready = { complete: true, affordable: true, locked: false };

describe("Resolve button", () => {
  it("resolves a plan that feeds the population", () => {
    expect(resolveButton({ ...ready, balanceTons: 600 })).toEqual({
      label: "Resolve harvest",
      disabled: false,
      warning: false,
    });
  });

  it("states an ordinary-forecast shortfall but still allows resolving", () => {
    expect(resolveButton({ ...ready, balanceTons: -200 })).toEqual({
      label: "Resolve with 200 t shortfall",
      disabled: false,
      warning: true,
    });
  });

  it.each([
    ["an incomplete plan", { complete: false }],
    ["an unaffordable plan", { affordable: false }],
    ["a locked run", { locked: true }],
  ])("is disabled for %s", (_, change) => {
    expect(
      resolveButton({ ...ready, ...change, balanceTons: 0 }).disabled,
    ).toBe(true);
  });
});

describe("Finish year button", () => {
  it("finishes a valid allocation", () => {
    expect(finishButton({ valid: true, locked: false })).toEqual({
      label: "Finish year",
      disabled: false,
      warning: false,
    });
  });

  it.each([
    ["an invalid allocation", { valid: false, locked: false }],
    ["a locked run", { valid: true, locked: true }],
  ])("is disabled for %s", (_, input) => {
    expect(finishButton(input).disabled).toBe(true);
  });
});
