import { CONFIG } from "./config.js";
import { createNewGame, estimateHarvestTons, resolveTurn } from "./simulation.js";
import type { GameState, PlayerPlan, TurnResult } from "./types.js";

// Thin adapter around the deterministic simulation core: DOM rendering + localStorage persistence.
const SAVE_KEY = "growOrDie.save.v1";

interface SaveData {
  version: number;
  runSeed: number;
  state: GameState;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== 1 || !parsed.state || typeof parsed.runSeed !== "number") return null;
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
};

function renderStats(state: GameState): void {
  el<HTMLSpanElement>("stat-year").textContent = String(state.year);
  el<HTMLSpanElement>("stat-population").textContent = fmt(state.population);
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

  updatePlanPreview(state);
}

function clampedHectares(state: GameState, raw: number): number {
  const max = state.preparedLandHectares;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(Math.floor(raw), max));
}

// Deterministic pre-event estimate of this Turn's Surplus for the plan preview.
function estimateSurplusTons(state: GameState, cultivatedHectares: number, fertilizedHectares: number): number {
  const harvestTons = estimateHarvestTons(CONFIG, cultivatedHectares, fertilizedHectares);
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
  return { cultivatedHectares, fertilizedHectares, preparedHectares, storeTons };
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
  const totalCost = seedCost + fertilizerCost + prepCost;
  el<HTMLElement>("plan-seed-cost").textContent = fmt(seedCost);
  el<HTMLElement>("plan-fert-cost").textContent = fmt(fertilizerCost);
  el<HTMLElement>("plan-prep-cost").textContent = fmt(prepCost);
  el<HTMLElement>("plan-total-cost").textContent = fmt(totalCost);

  const remaining = state.budgetCoins - totalCost;
  const remainingEl = el<HTMLElement>("plan-remaining");
  remainingEl.textContent = `${fmt(remaining)} coins`;
  remainingEl.classList.toggle("overspend", remaining < 0);
  el<HTMLButtonElement>("confirm-btn").disabled = remaining < 0;

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
  el<HTMLElement>("report-harvest").textContent = `${fmt(report.harvestTons)} t`;
  el<HTMLElement>("report-consumption").textContent = `${fmt(report.consumptionTons)} t`;
  el<HTMLElement>("report-available").textContent = `${fmt(report.availableFoodTons)} t`;

  const famineEl = el<HTMLElement>("report-famine");
  famineEl.textContent = report.famine === "none" ? "No Famine" : `Famine (${report.famine})`;
  famineEl.classList.toggle("famine", report.famine !== "none");

  const delta = report.populationEnd - report.populationStart;
  el<HTMLElement>("report-pop-change").textContent = `${fmt(report.populationStart)} → ${fmt(report.populationEnd)} (${delta >= 0 ? "+" : ""}${fmt(delta)})`;

  el<HTMLElement>("report-seeds").textContent = `-${fmt(report.seedCostCoins)}`;
  el<HTMLElement>("report-fertilizer").textContent = `-${fmt(report.fertilizerCostCoins)}`;
  el<HTMLElement>("report-prep").textContent = `-${fmt(report.landPrepCostCoins)}`;
  el<HTMLElement>("report-upkeep").textContent = `-${fmt(report.storageUpkeepCoins)}`;
  el<HTMLElement>("report-export").textContent = `${fmt(report.exportTons)} t for +${fmt(report.exportIncomeCoins)} coins`;
  el<HTMLElement>("report-carryover").textContent = `${fmt(report.budgetCarryOverCoins)}`;
  el<HTMLElement>("report-tax").textContent = `+${fmt(report.budgetRevenueCoins)}`;
  el<HTMLElement>("report-new-budget").textContent = fmt(state.budgetCoins);
}

function render(): void {
  renderStats(save.state);
  renderPlan(save.state);
}

function confirmPlan(): void {
  const plan = readPlanInputs(save.state);
  const previous = save.state;
  const result = resolveTurn(previous, plan, turnSeed(save.runSeed, previous.year), CONFIG);
  save.state = result.state;
  persist(save);
  renderReport(previous, result);
  render();
}

function restart(): void {
  if (!window.confirm("Restart from the beginning? Your current run will be lost.")) return;
  save = { version: 1, runSeed: (Math.random() * 0x7fffffff) | 0, state: createNewGame(CONFIG) };
  persist(save);
  el<HTMLElement>("report").hidden = true;
  render();
}

function init(): void {
  for (const id of ["plan-hectares", "plan-fertilizer", "plan-prep", "plan-store"]) {
    el<HTMLInputElement>(id).addEventListener("input", () => updatePlanPreview(save.state));
  }
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  render();
}

init();
