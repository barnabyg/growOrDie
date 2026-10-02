import type { EventType, GameState } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PARCELS = 20;

function element(tag: string, attributes: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

/** Decorative parcels visualize aggregate hectares; they are not additional
 * regions or clickable game rules. Partial parcels represent fractional hectares. */
export function createLandscape(svg: SVGSVGElement): void {
  const fields = svg.querySelector("#country-fields");
  const crops = svg.querySelector("#country-green");
  const definitions = svg.querySelector("defs");
  if (!fields || !crops || !definitions)
    throw new Error("Missing landscape layers");
  for (let i = 0; i < PARCELS; i++) {
    const x = 44 + (i % 5) * 86;
    const y = 162 + Math.floor(i / 5) * 49;
    const field = element("g", { "data-parcel": i });
    field.append(
      element("rect", {
        x,
        y,
        width: 77,
        height: 40,
        rx: 5,
        class: "unprepared-field",
      }),
    );
    field.append(
      element("rect", {
        x,
        y,
        width: 0,
        height: 40,
        rx: 5,
        class: "prepared-field",
      }),
    );
    field.append(
      element("use", {
        href: "#land-tree",
        x: x + 26,
        y: y + 3,
        class: "parcel-tree",
      }),
    );
    fields.append(field);
    const clip = element("clipPath", { id: `parcel-clip-${i}` });
    clip.append(element("rect", { x, y, width: 0, height: 40, rx: 5 }));
    definitions.append(clip);
    const crop = element("g", { "clip-path": `url(#parcel-clip-${i})` });
    crop.append(element("rect", { x, y, width: 77, height: 40, rx: 5 }));
    crop.append(
      element("rect", { x, y, width: 77, height: 40, fill: "url(#crop-rows)" }),
    );
    crops.append(crop);
  }
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
  for (let i = 0; i < PARCELS; i++) {
    const prepared = share(state.preparedLandHectares, i);
    svg
      .querySelector(`[data-parcel="${i}"] .prepared-field`)
      ?.setAttribute("width", String(77 * prepared));
    svg
      .querySelector(`[data-parcel="${i}"] .parcel-tree`)
      ?.setAttribute("opacity", String(1 - prepared));
    svg
      .querySelector(`#parcel-clip-${i} rect`)
      ?.setAttribute("width", String(77 * share(cultivatedHectares ?? 0, i)));
  }
  const green = svg.querySelector("#country-green");
  green?.classList.toggle("drought", event === "drought");
  green?.classList.toggle("flood", event === "flood");
  svg.classList.toggle("weather-drought", event === "drought");
  svg.classList.toggle("weather-flood", event === "flood");
  svg.classList.toggle("collapsed", state.collapsed);
  const houses = Math.min(8, Math.max(0, Math.ceil(population / 500)));
  const built = Math.max(
    houses,
    Math.min(8, Math.ceil(state.highestPopulation / 500)),
  );
  svg.querySelectorAll(".village-house").forEach((house, i) => {
    house.setAttribute("opacity", i < houses ? "1" : i < built ? "0.2" : "0");
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
