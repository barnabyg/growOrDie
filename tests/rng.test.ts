import { describe, it, expect } from "vitest";
import { createRng } from "../src/rng.js";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createRng(42);
    const second = createRng(42);
    const a = Array.from({ length: 10 }, () => first());
    const b = Array.from({ length: 10 }, () => second());
    expect(b).toEqual(a);
  });

  it("returns values in [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const first = createRng(1);
    const second = createRng(2);
    const a = Array.from({ length: 5 }, () => first());
    const b = Array.from({ length: 5 }, () => second());
    expect(b).not.toEqual(a);
  });
});
