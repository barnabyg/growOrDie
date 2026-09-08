import { CONFIG } from "./config.js";
import { createNewGame, estimateHarvestTons, eventSummary, resolveTurn } from "./simulation.js";
import type { EventType, GameState, PlayerPlan, TechnologyId, TurnResult } from "./types.js";

// Thin adapter around the deterministic simulation core: DOM rendering + localStorage persistence.
const SAVE_KEY = "growOrDie.save.v1";
// Matches the #country-svg viewBox height in index.html; the green area fills from the bottom.
const COUNTRY_VIEWBOX_HEIGHT = 340;

// One-off Technologies in display order (mirrors the Technologies section of index.html).
const TECHNOLOGY_IDS: TechnologyId[] = ["irrigation", "highYieldSeeds", "granary", "tradeRoutes", "landSurvey", "fertilizerWorks"];
const TECHNOLOGY_NAMES: Record<TechnologyId, string> = {
  irrigation: "Irrigation",
  highYieldSeeds: "High-yield seeds",
  granary: "Granary",
  tradeRoutes: "Trade routes",
  landSurvey: "Land survey",
  fertilizerWorks: "Fertilizer works",
};

interface SaveData {
  version: number;
  runSeed: number;
  state: GameState;
  // One entry per confirmed Turn (including "none" years); rebuilt into the log on load.
  eventLog: { year: number; event: EventType; summary: string }[];
}

function el<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as unknown as T;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 1 || !parsed.state || typeof parsed.runSeed !== "number") {
      return null;
    }
    // Tolerant of saves written before the event log existed.
    parsed.eventLog = Array.isArray(parsed.eventLog) ? parsed.eventLog : [];
    // Tolerant of saves written before Technologies existed.
    parsed.state.ownedTechnologies = Array.isArray(parsed.state.ownedTechnologies) ? parsed.state.ownedTechnologies : [];
    // Tolerant of saves written before Score and Collapse tracking existed.
    if (typeof parsed.state.highestPopulation !== "number") {
      parsed.state.highestPopulation = CONFIG.startingPopulation;
    }
    parsed.state.collapsed = parsed.state.collapsed === true;
    parsed.state.collapseCause =
      parsed.state.collapseCause === "totalFamine" || parsed.state.collapseCause === "belowHalf" ? parsed.state.collapseCause : null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(save: SaveData): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

// Per-turn seed derived from the run seed so a given run is reproducible.
function turnSeed(runSeed: number, year: number): number {
  return (runSeed + year) >>> 0;
}

let save: SaveData = loadSave() ?? {
  version: 1,
  runSeed: (Math.random() * 0x7fffffff) | 0,
  state: createNewGame(CONFIG),
  eventLog: [],
};

function renderStats(state: GameState): void {
  el<HTMLSpanElement>("stat-year").textContent = String(state.year);
  el<HTMLSpanElement>("stat-population").textContent = fmt(state.population);
  el<HTMLSpanElement>("stat-score").textContent = fmt(state.highestPopulation);
  el<HTMLSpanElement>("stat-storage").textContent = `${fmt(state.storageTons)} t`;
  el<HTMLSpanElement>("stat-budget").textContent = `${fmt(state.budgetCoins)} coins`;
  el<HTMLSpanElement>("stat-price").textContent = `${state.worldPrice.toFixed(2)} /t`;
}

function renderPlan(state: GameState): void {
  el<HTMLElement>("plan-year").textContent = String(state.year);
  const maxHectares = state.preparedLandHectares;
  el<HTMLElement>("plan-max").textContent = fmt(maxHectares);
  el<HTMLElement>("plan-fert-price").textContent = fmt(CONFIG.fertilizerCostPerHectare);
  const maxPrep = state.arableLandHectares - state.preparedLandHectares;
  el<HTMLElement>("plan-prep-max").textContent = fmt(maxPrep);
  el<HTMLElement>("plan-prep-price").textContent = fmt(CONFIG.landPrepCostPerHectare);
  el<HTMLElement>("plan-upkeep-price").textContent = fmt(CONFIG.storageUpkeepPerTonPerYear);

  const input = el<HTMLInputElement>("plan-hectares");
  input.max = String(maxHectares);
  input.value = String(maxHectares);
  const fertilizerInput = el<HTMLInputElement>("plan-fertilizer");
  fertilizerInput.max = String(maxHectares);
  fertilizerInput.value = "0";
  const prepInput = el<HTMLInputElement>("plan-prep");
  prepInput.max = String(maxPrep);
  prepInput.value = "0";

  const estSurplus = estimateSurplusTons(state, maxHectares, 0);
  const minStore = minReStoreTons(state);
  const storeInput = el<HTMLInputElement>("plan-store");
  storeInput.min = String(minStore);
  storeInput.max = String(estSurplus);
  // Default to keeping the whole Surplus; lowering it auto-exports the difference.
  storeInput.value = String(estSurplus);

  const owned = new Set(state.ownedTechnologies);
  for (const id of TECHNOLOGY_IDS) {
    const checkbox = el<HTMLInputElement>(`tech-${id}`);
    // Owned Technologies are locked in; unowned ones start unchecked each Turn.
    checkbox.checked = owned.has(id);
    checkbox.disabled = owned.has(id);
    el<HTMLElement>(`tech-${id}-owned`).hidden = !owned.has(id);
  }

  updatePlanPreview(state);
}

function clampedHectares(state: GameState, raw: number): number {
  const max = state.preparedLandHectares;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(Math.floor(raw), max));
}

// Deterministic pre-event estimate of this Turn's Surplus for the plan preview.
function estimateSurplusTons(state: GameState, cultivatedHectares: number, fertilizedHectares: number): number {
  const harvestTons = estimateHarvestTons(CONFIG, cultivatedHectares, fertilizedHectares, state.ownedTechnologies.includes("highYieldSeeds"));
  const consumptionTons = state.population * CONFIG.consumptionPerPerson;
  return Math.max(0, harvestTons + state.storageTons - consumptionTons);
}

// Stored food can never be exported: if opening Storage alone covers Consumption,
// at least (storage - consumption) must be re-stored this Turn.
function minReStoreTons(state: GameState): number {
  return Math.max(0, state.storageTons - state.population * CONFIG.consumptionPerPerson);
}

function readPlanInputs(state: GameState): PlayerPlan {
  const cultivatedHectares = clampedHectares(state, Number(el<HTMLInputElement>("plan-hectares").value));
  const rawFertilizer = Number(el<HTMLInputElement>("plan-fertilizer").value);
  const fertilizedHectares = !Number.isFinite(rawFertilizer)
    ? 0
    : Math.max(0, Math.min(Math.floor(rawFertilizer), cultivatedHectares));
  const maxPrep = state.arableLandHectares - state.preparedLandHectares;
  const rawPrep = Number(el<HTMLInputElement>("plan-prep").value);
  const preparedHectares = !Number.isFinite(rawPrep)
    ? 0
    : Math.max(0, Math.min(Math.floor(rawPrep), maxPrep));
  const estSurplus = estimateSurplusTons(state, cultivatedHectares, fertilizedHectares);
  const rawStore = Number(el<HTMLInputElement>("plan-store").value);
  const storeTons = !Number.isFinite(rawStore) ? 0 : Math.max(0, Math.min(rawStore, estSurplus));
  // Only unowned Technologies can be purchased this Turn.
  const purchaseTechnologies = TECHNOLOGY_IDS.filter((id) => !state.ownedTechnologies.includes(id) && el<HTMLInputElement>(`tech-${id}`).checked);
  return { cultivatedHectares, fertilizedHectares, preparedHectares, storeTons, purchaseTechnologies };
}

function updatePlanPreview(state: GameState): void {
  const plan = readPlanInputs(state);

  // Keep each input's max in sync with the others (fertilizer <= cultivated).
  el<HTMLInputElement>("plan-fertilizer").max = String(plan.cultivatedHectares);

  const storeInput = el<HTMLInputElement>("plan-store");
  const estSurplus = estimateSurplusTons(state, plan.cultivatedHectares, plan.fertilizedHectares);
  storeInput.max = String(estSurplus);
  if (estSurplus <= 0) {
    // Famine expected: nothing to store or export.
    storeInput.disabled = true;
    storeInput.value = "0";
  } else {
    storeInput.disabled = false;
  }

  const seedCost = plan.cultivatedHectares * CONFIG.seedCostPerHectare;
  const fertilizerCost = plan.fertilizedHectares * CONFIG.fertilizerCostPerHectare;
  const prepCost = plan.preparedHectares * CONFIG.landPrepCostPerHectare;
  const technologyCost = (plan.purchaseTechnologies ?? []).reduce((sum, id) => sum + CONFIG.technologyCosts[id], 0);
  const totalCost = seedCost + fertilizerCost + prepCost + technologyCost;
  el<HTMLElement>("plan-seed-cost").textContent = fmt(seedCost);
  el<HTMLElement>("plan-fert-cost").textContent = fmt(fertilizerCost);
  el<HTMLElement>("plan-prep-cost").textContent = fmt(prepCost);
  el<HTMLElement>("plan-tech-cost").textContent = fmt(technologyCost);
  el<HTMLElement>("plan-total-cost").textContent = fmt(totalCost);

  const remaining = state.budgetCoins - totalCost;
  const remainingEl = el<HTMLElement>("plan-remaining");
  remainingEl.textContent = `${fmt(remaining)} coins`;
  remainingEl.classList.toggle("overspend", remaining < 0);
  el<HTMLButtonElement>("confirm-btn").disabled = remaining < 0 || state.collapsed;

  const minStore = minReStoreTons(state);
  const effectiveStore = estSurplus > 0 ? Math.max(minStore, plan.storeTons) : 0;
  const estExport = estSurplus - effectiveStore;
  el<HTMLElement>("plan-store-range").textContent = estSurplus > 0 ? `${fmt(minStore)}-${fmt(estSurplus)} t` : "—";
  el<HTMLElement>("plan-upkeep-cost").textContent = fmt(effectiveStore * CONFIG.storageUpkeepPerTonPerYear);
  el<HTMLElement>("plan-export-est").textContent =
    estSurplus > 0
      ? `${fmt(estExport)} t × ${state.worldPrice.toFixed(2)} coins/t = +${fmt(estExport * state.worldPrice)} coins`
      : "—";
}

function renderReport(previous: GameState, result: TurnResult): void {
  const { report, state } = result;
  const section = el<HTMLElement>("report");
  section.hidden = false;

  el<HTMLElement>("report-year").textContent = String(report.year);
  el<HTMLElement>("report-event").textContent = eventSummary(report);
  el<HTMLElement>("report-harvest").textContent = `${fmt(report.harvestTons)} t`;
  el<HTMLElement>("report-consumption").textContent = `${fmt(report.consumptionTons)} t`;
  el<HTMLElement>("report-available").textContent = `${fmt(report.availableFoodTons)} t`;

  const famineEl = el<HTMLElement>("report-famine");
  famineEl.textContent = report.famine === "none" ? "No Famine" : `Famine (${report.famine})`;
  famineEl.classList.toggle("famine", report.famine !== "none");

  const milestoneLevel = report.milestoneLevel;
  const milestoneEl = el<HTMLElement>("milestone-banner");
  if (milestoneLevel !== null) {
    const threshold = CONFIG.startingPopulation * 2 ** milestoneLevel;
    milestoneEl.textContent = `Milestone — population reached ×${2 ** milestoneLevel} of the starting value: ${fmt(threshold)} people`;
    milestoneEl.hidden = false;
  } else {
    milestoneEl.hidden = true;
  }

  const delta = report.populationEnd - report.populationStart;
  el<HTMLElement>("report-pop-change").textContent = `${fmt(report.populationStart)} → ${fmt(report.populationEnd)} (${delta >= 0 ? "+" : ""}${fmt(delta)})`;

  el<HTMLElement>("report-seeds").textContent = `-${fmt(report.seedCostCoins)}`;
  el<HTMLElement>("report-fertilizer").textContent = `-${fmt(report.fertilizerCostCoins)}`;
  el<HTMLElement>("report-prep").textContent = `-${fmt(report.landPrepCostCoins)}`;
  el<HTMLElement>("report-upkeep").textContent = `-${fmt(report.storageUpkeepCoins)}`;
  el<HTMLElement>("report-technologies").textContent = report.technologiesPurchased.length > 0
    ? `-${fmt(report.technologyCostCoins)} coins (${report.technologiesPurchased.map((id) => TECHNOLOGY_NAMES[id]).join(", ")})`
    : "—";
  el<HTMLElement>("report-export").textContent = `${fmt(report.exportTons)} t for +${fmt(report.exportIncomeCoins)} coins`;
  el<HTMLElement>("report-carryover").textContent = `${fmt(report.budgetCarryOverCoins)}`;
  el<HTMLElement>("report-tax").textContent = `+${fmt(report.budgetRevenueCoins)}`;
  el<HTMLElement>("report-new-budget").textContent = fmt(state.budgetCoins);
}

function renderCollapse(state: GameState): void {
  const section = el<HTMLElement>("collapse-summary");
  if (!state.collapsed) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const turns = state.year - 1;
  el<HTMLElement>("collapse-length").textContent = `${turns} ${turns === 1 ? "Turn" : "Turns"}`;
  el<HTMLElement>("collapse-score").textContent = fmt(state.highestPopulation);
  el<HTMLElement>("collapse-cause").textContent = state.collapseCause === "totalFamine"
    ? "Total Famine: no food at all, the population reached zero."
    : `The population fell below half of the starting ${fmt(CONFIG.startingPopulation)}.`;
}

function render(): void {
  renderStats(save.state);
  renderCountry(save.state);
  renderPlan(save.state);
  renderCollapse(save.state);
  renderEventLog();
}

function renderCountry(state: GameState): void {
  const green = el<SVGRectElement>("country-green");
  const fraction = state.arableLandHectares > 0 ? Math.min(1, state.preparedLandHectares / state.arableLandHectares) : 0;
  const height = fraction * COUNTRY_VIEWBOX_HEIGHT;
  green.setAttribute("y", String(COUNTRY_VIEWBOX_HEIGHT - height));
  green.setAttribute("height", String(height));

  // Tint by the last resolved Event: Drought browns its own year, Flood stays blue until another Event.
  const last = save.eventLog.at(-1);
  const tintedFlood = last?.event === "flood";
  const tintedDrought = last?.event === "drought" && last.year === state.year;
  green.classList.toggle("flood", tintedFlood);
  green.classList.toggle("drought", tintedDrought);

  el<HTMLElement>("country-caption").textContent = `${fmt(state.preparedLandHectares)} of ${fmt(state.arableLandHectares)} ha prepared (${Math.round(fraction * 100)}%)`;
}

function renderEventLog(): void {
  const list = el<HTMLElement>("event-log");
  list.textContent = "";
  for (const entry of save.eventLog) {
    const item = document.createElement("li");
    item.className = entry.event;
    item.textContent = `Year ${entry.year}: ${entry.summary}`;
    list.appendChild(item);
  }
}

function confirmPlan(): void {
  if (save.state.collapsed) return;
  const plan = readPlanInputs(save.state);
  const previous = save.state;
  const result = resolveTurn(previous, plan, turnSeed(save.runSeed, previous.year), CONFIG);
  save.state = result.state;
  save.eventLog.push({ year: result.report.year, event: result.report.event, summary: eventSummary(result.report) });
  persist(save);
  renderReport(previous, result);
  render();
}

function restart(): void {
  if (!window.confirm("Restart from the beginning? Your current run will be lost.")) return;
  save = { version: 1, runSeed: (Math.random() * 0x7fffffff) | 0, state: createNewGame(CONFIG), eventLog: [] };
  persist(save);
  el<HTMLElement>("report").hidden = true;
  render();
}

function init(): void {
  for (const id of ["plan-hectares", "plan-fertilizer", "plan-prep", "plan-store"]) {
    el<HTMLInputElement>(id).addEventListener("input", () => updatePlanPreview(save.state));
  }
  for (const techId of TECHNOLOGY_IDS) {
    el<HTMLInputElement>(`tech-${techId}`).addEventListener("change", () => updatePlanPreview(save.state));
  }
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  render();
}

init();
