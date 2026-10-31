import type { EventType, GameState } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLUMNS = 5;
/** Top and bottom of each row of parcels, growing towards the viewer. */
const ROWS = [
  [160, 192],
  [198, 238],
  [245, 294],
  [302, 360],
] as const;
export const PARCELS = COLUMNS * ROWS.length;
const [FIELD_TOP, FIELD_BOTTOM] = [ROWS[0][0], ROWS[3][1]];
const COLUMN_GAP = 0.008;

type Point = readonly [x: number, y: number];
/** Corners in order: top left, top right, bottom right, bottom left. */
export type Quad = readonly [Point, Point, Point, Point];

const between = (from: number, to: number, share: number) =>
  from + (to - from) * share;
const betweenPoints = (from: Point, to: Point, share: number): Point => [
  between(from[0], to[0], share),
  between(from[1], to[1], share),
];

/** A point on the farmland, whose sides converge towards the village. `across`
 * runs from 0 at the left edge to 1 at the right. */
function fieldPoint(across: number, y: number): Point {
  const depth = (y - FIELD_TOP) / (FIELD_BOTTOM - FIELD_TOP);
  return [between(between(86, 58, depth), between(450, 484, depth), across), y];
}

/** Parcels fill from the top left, row by row, nearest the village first. */
export function parcelQuad(index: number): Quad {
  const column = index % COLUMNS;
  const [top, bottom] = ROWS[Math.floor(index / COLUMNS)] ?? ROWS[0];
  const left = column / COLUMNS + COLUMN_GAP;
  const right = (column + 1) / COLUMNS - COLUMN_GAP;
  return [
    fieldPoint(left, top),
    fieldPoint(right, top),
    fieldPoint(right, bottom),
    fieldPoint(left, bottom),
  ];
}

/** The left part of a parcel. Its top and bottom are parallel, so its area is
 * exactly `share` of the parcel's. */
export function quadPart(quad: Quad, share: number): Quad {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  return [
    topLeft,
    betweenPoints(topLeft, topRight, share),
    betweenPoints(bottomLeft, bottomRight, share),
    bottomLeft,
  ];
}

function quadPoint(quad: Quad, across: number, down: number): Point {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  return betweenPoints(
    betweenPoints(topLeft, topRight, across),
    betweenPoints(bottomLeft, bottomRight, across),
    down,
  );
}

const pointList = (points: readonly Point[]) =>
  points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

const line = (from: Point, to: Point) =>
  `M${from[0].toFixed(2)} ${from[1].toFixed(2)}L${to[0].toFixed(2)} ${to[1].toFixed(2)}`;

/** Evenly spaced lines running from the far edge of a parcel to the near edge. */
function plantedRows(quad: Quad, count: number): string {
  let rows = "";
  for (let i = 0; i < count; i++) {
    const across = (i + 0.5) / count;
    rows += line(quadPoint(quad, across, 0), quadPoint(quad, across, 1));
  }
  return rows;
}

function element(tag: string, attributes: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

const SYMBOL_SIZES = {
  "land-tree": [26, 32],
  "land-oak": [30, 32],
} as const;
type WildPlant = readonly [
  symbol: keyof typeof SYMBOL_SIZES,
  across: number,
  down: number,
  scale: number,
];
/** Hand-placed so neighbouring parcels of rough pasture don't look stamped.
 * Each layout runs back to front, so nearer plants paint over farther ones. */
const WILD_LAYOUTS: readonly (readonly WildPlant[])[] = [
  [
    ["land-tree", 0.22, 0.42, 0.85],
    ["land-oak", 0.72, 0.58, 0.95],
    ["land-tree", 0.44, 0.92, 1],
  ],
  [
    ["land-oak", 0.3, 0.5, 0.9],
    ["land-tree", 0.78, 0.46, 0.8],
    ["land-tree", 0.6, 0.94, 1.05],
  ],
  [
    ["land-tree", 0.62, 0.4, 0.8],
    ["land-tree", 0.2, 0.74, 0.95],
    ["land-oak", 0.8, 0.92, 1],
  ],
];
const SCRUB: readonly (readonly [across: number, down: number])[] = [
  [0.48, 0.24],
  [0.9, 0.2],
  [0.34, 0.66],
  [0.08, 0.92],
];

/** A parcel's trees and scrub. Each disappears once preparation passes it. */
function wildPlants(quad: Quad, index: number, scale: number): SVGElement[] {
  const clearedAt = (across: number) => (index + across) / PARCELS;
  const scrub = SCRUB.map(([across, down]) => {
    const [x, y] = quadPoint(quad, across, down);
    return element("use", {
      href: "#land-tuft",
      x: x - 5 * scale,
      y: y - 7 * scale,
      width: 10 * scale,
      height: 7 * scale,
      class: "parcel-wild",
      "data-clear": clearedAt(across),
    });
  });
  const plants = (WILD_LAYOUTS[index % WILD_LAYOUTS.length] ?? []).map(
    ([symbol, across, down, relativeSize]) => {
      const [x, y] = quadPoint(quad, across, down);
      const size = relativeSize * scale * 0.85;
      const [width, height] = SYMBOL_SIZES[symbol];
      return element("use", {
        href: `#${symbol}`,
        x: x - (width * size) / 2,
        y: y - height * size,
        width: width * size,
        height: height * size,
        class: "parcel-wild",
        "data-clear": clearedAt(across),
      });
    },
  );
  return [...scrub, ...plants];
}

/** A group showing only the part of its parcel that `renderLandscape` sets. */
function revealedGroup(definitions: Element, id: string): SVGElement {
  const clip = element("clipPath", { id });
  clip.append(element("polygon", { points: "" }));
  definitions.append(clip);
  return element("g", { "clip-path": `url(#${id})` });
}

/** Decorative parcels visualize aggregate hectares; they are not additional
 * regions or clickable game rules. Partial parcels represent fractional hectares. */
export function createLandscape(svg: SVGSVGElement): void {
  const fields = svg.querySelector("#country-fields");
  const crops = svg.querySelector("#country-green");
  const wild = svg.querySelector("#country-wild");
  const channels = svg.querySelector("#irrigation-channels");
  const definitions = svg.querySelector("defs");
  if (!fields || !crops || !wild || !channels || !definitions)
    throw new Error("Missing landscape layers");
  for (let i = 0; i < PARCELS; i++) {
    const quad = parcelQuad(i);
    const points = pointList(quad);
    const row = Math.floor(i / COLUMNS);
    const scale = 0.72 + row * 0.2;
    const nearEdge = line(quad[3], quad[2]);
    fields.append(element("polygon", { points, class: "unprepared-field" }));
    const soil = revealedGroup(definitions, `parcel-soil-clip-${i}`);
    soil.append(
      element("polygon", { points, class: "prepared-field" }),
      element("path", {
        d: plantedRows(quad, 7 + row),
        class: "soil-furrow",
        "stroke-width": 1.1 * scale,
      }),
      element("path", { d: nearEdge, class: "field-edge" }),
    );
    fields.append(soil);
    const crop = revealedGroup(definitions, `parcel-crop-clip-${i}`);
    const rows = plantedRows(quad, 7 + row);
    crop.append(
      element("polygon", { points, class: "crop-land" }),
      element("path", {
        d: rows,
        class: "crop-furrow",
        "stroke-width": 2.6 * scale,
      }),
      element("path", {
        d: rows,
        class: "crop-plants",
        "stroke-width": 1.7 * scale,
        "stroke-dasharray": `${2 * scale} ${1.6 * scale}`,
      }),
      element("path", { d: nearEdge, class: "field-edge" }),
    );
    crops.append(crop);
    wild.append(...wildPlants(quad, i, scale));
  }
  for (let column = 1; column < COLUMNS; column++) {
    channels.append(
      element("path", {
        d: line(
          fieldPoint(column / COLUMNS, FIELD_TOP - 5),
          fieldPoint(column / COLUMNS, FIELD_BOTTOM),
        ),
      }),
    );
  }
}

const VILLAGE_HOUSES = 8;
const PEOPLE_PER_HOUSE = 500;

/** Village houses for the current Population. Faded houses stand for
 * Population lost below the run's peak (Score). */
export function villageHouses(
  population: number,
  highestPopulation: number,
): { occupied: number; faded: number } {
  const houses = (people: number) =>
    Math.min(VILLAGE_HOUSES, Math.max(0, Math.ceil(people / PEOPLE_PER_HOUSE)));
  const occupied = houses(population);
  return {
    occupied,
    faded: Math.max(0, houses(highestPopulation) - occupied),
  };
}

/** Ends the first render. The landscape starts with transitions disabled so a
 * load or reload shows the saved country without animating. */
export function settleLandscape(svg: SVGSVGElement): void {
  svg.getBoundingClientRect();
  svg.classList.remove("landscape-settling");
}

export function renderLandscape(
  svg: SVGSVGElement,
  state: GameState,
  cultivatedHectares: number | undefined,
  event: EventType,
  population: number,
): void {
  const share = (hectares: number, i: number) =>
    state.arableLandHectares > 0
      ? Math.max(
          0,
          Math.min(1, (hectares / state.arableLandHectares) * PARCELS - i),
        )
      : 0;
  const reveal = (clip: string, part: number, quad: Quad) =>
    svg
      .querySelector(`#${clip} polygon`)
      ?.setAttribute("points", pointList(quadPart(quad, part)));
  for (let i = 0; i < PARCELS; i++) {
    const quad = parcelQuad(i);
    reveal(`parcel-soil-clip-${i}`, share(state.preparedLandHectares, i), quad);
    reveal(`parcel-crop-clip-${i}`, share(cultivatedHectares ?? 0, i), quad);
  }
  const preparedShare =
    state.arableLandHectares > 0
      ? state.preparedLandHectares / state.arableLandHectares
      : 0;
  svg.querySelectorAll<SVGElement>(".parcel-wild").forEach((plant) => {
    plant.setAttribute(
      "opacity",
      Number(plant.dataset["clear"]) < preparedShare ? "0" : "1",
    );
  });
  const green = svg.querySelector("#country-green");
  green?.classList.toggle("drought", event === "drought");
  green?.classList.toggle("flood", event === "flood");
  svg.classList.toggle("weather-drought", event === "drought");
  svg.classList.toggle("weather-flood", event === "flood");
  svg.classList.toggle("collapsed", state.collapsed);
  const { occupied, faded } = villageHouses(
    population,
    state.highestPopulation,
  );
  svg.querySelectorAll(".village-house").forEach((house, i) => {
    house.setAttribute(
      "opacity",
      i < occupied ? "1" : i < occupied + faded ? "0.2" : "0",
    );
  });
  for (const id of state.ownedTechnologies) {
    svg.querySelector(`#landmark-${id}`)?.removeAttribute("display");
  }
  svg.querySelectorAll("[id^=landmark-]").forEach((landmark) => {
    if (
      !state.ownedTechnologies.some((id) => landmark.id === `landmark-${id}`)
    ) {
      landmark.setAttribute("display", "none");
    }
  });
}
