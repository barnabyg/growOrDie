import { expect, it } from "vitest";
import { villageHouses } from "../src/landscape.js";

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
