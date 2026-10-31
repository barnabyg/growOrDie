import { expect, it } from "vitest";
import {
  PARCELS,
  parcelQuad,
  type Quad,
  quadPart,
  villageHouses,
} from "../src/landscape.js";

const parcels = Array.from({ length: PARCELS }, (_, i) => parcelQuad(i));

/** Shoelace formula. */
function area(quad: Quad): number {
  return (
    Math.abs(
      quad.reduce((sum, [x, y], i) => {
        const [nextX, nextY] = quad[(i + 1) % quad.length] ?? quad[0];
        return sum + x * nextY - nextX * y;
      }, 0),
    ) / 2
  );
}

it("lays out 20 parcels inside the scene, filling row by row from the village", () => {
  expect(parcels).toHaveLength(20);
  for (const [i, quad] of parcels.entries()) {
    const [topLeft, topRight, bottomRight, bottomLeft] = quad;
    for (const [x, y] of quad) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(520);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(385);
    }
    expect(topRight[0]).toBeGreaterThan(topLeft[0]);
    expect(bottomRight[0]).toBeGreaterThan(bottomLeft[0]);
    expect(bottomLeft[1]).toBeGreaterThan(topLeft[1]);
    const next = parcels[i + 1];
    if (next && (i + 1) % 5 !== 0) {
      // Each parcel ends before the next one in its row starts.
      expect(next[0][0]).toBeGreaterThan(topRight[0]);
      expect(next[3][0]).toBeGreaterThan(bottomRight[0]);
    }
    const below = parcels[i + 5];
    // Each parcel ends before the one below it starts.
    if (below) expect(below[0][1]).toBeGreaterThan(bottomLeft[1]);
  }
});

it("makes nearer rows larger, for perspective", () => {
  const rowArea = (row: number) => area(parcelQuad(row * 5));
  expect(rowArea(1)).toBeGreaterThan(rowArea(0));
  expect(rowArea(2)).toBeGreaterThan(rowArea(1));
  expect(rowArea(3)).toBeGreaterThan(rowArea(2));
});

it("draws a partial parcel with an area exactly proportional to its share", () => {
  for (const quad of parcels) {
    for (const share of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      expect(area(quadPart(quad, share))).toBeCloseTo(area(quad) * share, 8);
    }
  }
});

it("draws one occupied house per 500 people, up to eight", () => {
  expect(villageHouses(0, 0)).toEqual({ occupied: 0, faded: 0 });
  expect(villageHouses(1000, 1000)).toEqual({ occupied: 2, faded: 0 });
  expect(villageHouses(1050, 1050)).toEqual({ occupied: 3, faded: 0 });
  expect(villageHouses(9000, 9000)).toEqual({ occupied: 8, faded: 0 });
});

it("fades houses for Population lost below its peak", () => {
  expect(villageHouses(1000, 2600)).toEqual({ occupied: 2, faded: 4 });
  expect(villageHouses(0, 1000)).toEqual({ occupied: 0, faded: 2 });
  expect(villageHouses(3000, 20000)).toEqual({ occupied: 6, faded: 2 });
  // A peak within the same house adds no faded house.
  expect(villageHouses(1001, 1400)).toEqual({ occupied: 3, faded: 0 });
});
