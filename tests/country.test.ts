import { expect, it } from "vitest";
import { cultivationCut } from "../src/country.js";

it("uses area rather than bounding-box height for an irregular silhouette", () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ];
  expect(cultivationCut(triangle, 0)).toBe(10);
  expect(cultivationCut(triangle, 1)).toBe(0);
  expect(cultivationCut(triangle, 0.25)).toBeCloseTo(5, 8);
  expect(cultivationCut(triangle, 0.5)).toBeCloseTo(10 - Math.sqrt(50), 8);
});
