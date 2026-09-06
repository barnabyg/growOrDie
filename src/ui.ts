import { CONFIG } from "./config.js";
import { createNewGame, resolveTurn } from "./simulation.js";
import type { GameState, TurnResult } from "./types.js";

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
  el<HTMLSpanElement>("stat-price").textContent = `${state.worldPrice} /t`;
}

function renderPlan(state: GameState): void {
  el<HTMLElement>("plan-year").textContent = String(state.year);
  const maxHectares = state.preparedLandHectares;
  el<HTMLElement>("plan-max").textContent = fmt(maxHectares);

  const input = el<HTMLInputElement>("plan-hectares");
  input.max = String(maxHectares);
  input.value = String(maxHectares);

  updatePlanPreview(state, input);
}

function clampedHectares(state: GameState, raw: number): number {
  const max = state.preparedLandHectares;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(Math.floor(raw), max));
}

function updatePlanPreview(state: GameState, input: HTMLInputElement): void {
  const hectares = clampedHectares(state, Number(input.value));
  const seedCost = hectares * CONFIG.seedCostPerHectare;
  el<HTMLElement>("plan-seed-cost").textContent = fmt(seedCost);
  const affordable = seedCost <= state.budgetCoins;
  el<HTMLElement>("plan-remaining").textContent = `${fmt(state.budgetCoins - seedCost)} coins`;
  el<HTMLButtonElement>("confirm-btn").disabled = !affordable;
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
  el<HTMLElement>("report-upkeep").textContent = `-${fmt(report.storageUpkeepCoins)}`;
  el<HTMLElement>("report-carryover").textContent = `${fmt(report.budgetCarryOverCoins)}`;
  el<HTMLElement>("report-tax").textContent = `+${fmt(report.budgetRevenueCoins)}`;
  el<HTMLElement>("report-new-budget").textContent = fmt(state.budgetCoins);
}

function render(): void {
  renderStats(save.state);
  renderPlan(save.state);
}

function confirmPlan(): void {
  const input = el<HTMLInputElement>("plan-hectares");
  const hectares = clampedHectares(save.state, Number(input.value));
  const previous = save.state;
  const result = resolveTurn(previous, { cultivatedHectares: hectares }, turnSeed(save.runSeed, previous.year), CONFIG);
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
  const input = el<HTMLInputElement>("plan-hectares");
  input.addEventListener("input", () => updatePlanPreview(save.state, input));
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  render();
}

init();
