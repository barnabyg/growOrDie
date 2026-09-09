import { cultivationCut } from "./country.js";
import { beginTurn, finishTurn, productionCosts } from "./turn.js";
import { economyRates } from "./economy.js";
import { CONFIG } from "./config.js";
import { eventSummary } from "./simulation.js";
import type {
  GameState,
  PlayerPlan,
  TechnologyId,
  TurnResult,
} from "./types.js";
import { loadSave, newSave, persist } from "./persistence.js";
import type { SaveData } from "./persistence.js";

// Thin adapter around the deterministic simulation core and persistence module: DOM rendering only.
// Matches the #country-svg viewBox height in index.html; the green area fills from the bottom.
const COUNTRY_VIEWBOX_HEIGHT = 340;

// One-off Technologies in display order (mirrors the Technologies section of index.html).
const TECHNOLOGY_IDS: TechnologyId[] = [
  "irrigation",
  "highYieldSeeds",
  "granary",
  "tradeRoutes",
  "landSurvey",
  "fertilizerWorks",
];
const TECHNOLOGY_NAMES: Record<TechnologyId, string> = {
  irrigation: "Irrigation",
  highYieldSeeds: "High-yield seeds",
  granary: "Granary",
  tradeRoutes: "Trade routes",
  landSurvey: "Land survey",
  fertilizerWorks: "Fertilizer works",
};

function el<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as unknown as T;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");
const fmtRate = (n: number): string => n.toLocaleString("en-US");

// Per-turn seed derived from the run seed so a given run is reproducible.
function turnSeed(runSeed: number, year: number): number {
  return (runSeed + year) >>> 0;
}

let save: SaveData = loadSave() ?? newSave();

function renderStats(state: GameState): void {
  el<HTMLSpanElement>("stat-year").textContent = String(state.year);
  el<HTMLSpanElement>("stat-population").textContent = fmt(state.population);
  el<HTMLSpanElement>("stat-score").textContent = fmt(state.highestPopulation);
  el<HTMLSpanElement>("stat-storage").textContent =
    `${fmt(state.storageTons)} t`;
  el<HTMLSpanElement>("stat-budget").textContent =
    `${fmt(state.budgetCoins)} coins`;
  el<HTMLSpanElement>("stat-price").textContent =
    `${state.worldPrice.toFixed(2)} /t`;
}

function renderPlan(state: GameState): void {
  el<HTMLElement>("plan-year").textContent = String(state.year);
  const maxHectares = state.preparedLandHectares;
  el<HTMLElement>("plan-max").textContent = fmt(maxHectares);
  el<HTMLElement>("plan-fert-price").textContent = fmtRate(
    economyRates(state, CONFIG).fertilizer,
  );
  const maxPrep = state.arableLandHectares - state.preparedLandHectares;
  el<HTMLElement>("plan-prep-max").textContent = fmt(maxPrep);
  el<HTMLElement>("plan-prep-price").textContent = fmtRate(
    economyRates(state, CONFIG).preparation,
  );
  el<HTMLElement>("plan-upkeep-price").textContent = fmtRate(
    economyRates(state, CONFIG).upkeep,
  );

  const input = el<HTMLInputElement>("plan-hectares");
  input.max = String(maxHectares);
  input.value = String(maxHectares);
  const fertilizerInput = el<HTMLInputElement>("plan-fertilizer");
  fertilizerInput.max = String(maxHectares);
  fertilizerInput.value = "0";
  const prepInput = el<HTMLInputElement>("plan-prep");
  prepInput.max = String(maxPrep);
  prepInput.value = "0";

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

function readPlanInputs(state: GameState): PlayerPlan {
  const cultivatedHectares = clampedHectares(
    state,
    Number(el<HTMLInputElement>("plan-hectares").value),
  );
  const rawFertilizer = Number(el<HTMLInputElement>("plan-fertilizer").value);
  const fertilizedHectares = !Number.isFinite(rawFertilizer)
    ? 0
    : Math.max(0, Math.min(Math.floor(rawFertilizer), cultivatedHectares));
  const maxPrep = state.arableLandHectares - state.preparedLandHectares;
  const rawPrep = Number(el<HTMLInputElement>("plan-prep").value);
  const preparedHectares = !Number.isFinite(rawPrep)
    ? 0
    : Math.max(0, Math.min(Math.floor(rawPrep), maxPrep));
  // Only unowned Technologies can be purchased this Turn.
  const purchaseTechnologies = TECHNOLOGY_IDS.filter(
    (id) =>
      !state.ownedTechnologies.includes(id) &&
      el<HTMLInputElement>(`tech-${id}`).checked,
  );
  return {
    cultivatedHectares,
    fertilizedHectares,
    preparedHectares,
    storeTons: 0,
    purchaseTechnologies,
  };
}

function updatePlanPreview(state: GameState): void {
  const plan = readPlanInputs(state);

  // Keep each input's max in sync with the others (fertilizer <= cultivated).
  el<HTMLInputElement>("plan-fertilizer").max = String(plan.cultivatedHectares);

  const costs = productionCosts(state, plan, CONFIG);
  const seedCost = costs.seeds;
  const fertilizerCost = costs.fertilizer;
  const prepCost = costs.preparation;
  const technologyCost = costs.technologies;
  const totalCost = costs.total;
  el<HTMLElement>("plan-seed-cost").textContent = fmt(seedCost);
  el<HTMLElement>("plan-fert-cost").textContent = fmt(fertilizerCost);
  el<HTMLElement>("plan-prep-cost").textContent = fmt(prepCost);
  el<HTMLElement>("plan-tech-cost").textContent = fmt(technologyCost);
  el<HTMLElement>("plan-total-cost").textContent = fmt(totalCost);

  const remaining = state.budgetCoins - totalCost;
  const remainingEl = el<HTMLElement>("plan-remaining");
  remainingEl.textContent = `${fmt(remaining)} coins`;
  remainingEl.classList.toggle("overspend", remaining < 0);
  el<HTMLButtonElement>("confirm-btn").disabled =
    !costs.affordable || state.collapsed;

  el<HTMLElement>("plan-upkeep-cost").textContent = fmt(costs.upkeep);
}

function renderAllocation(): void {
  const pending = save.pendingTurn;
  el<HTMLElement>("allocation").hidden = !pending;
  el<HTMLElement>("production").hidden = !!pending;
  el<HTMLElement>("technologies").hidden = !!pending;
  if (!pending) return;
  const { report } = pending.result;
  el<HTMLElement>("allocation-year").textContent = String(report.year);
  el<HTMLElement>("allocation-event").textContent = eventSummary(report);
  el<HTMLElement>("allocation-harvest").textContent =
    `${fmt(report.harvestTons)} t`;
  el<HTMLElement>("allocation-consumption").textContent =
    `${fmt(report.consumptionTons)} t needed · Famine: ${report.famine} · population ${fmt(report.populationEnd)}`;
  el<HTMLElement>("allocation-surplus").textContent =
    `${fmt(Math.max(0, report.availableFoodTons - report.consumptionTons))} t`;
  el<HTMLElement>("allocation-price").textContent =
    `${report.exportPriceCoins.toFixed(2)} coins/t`;
  const input = el<HTMLInputElement>("plan-store");
  input.min = String(pending.minStoreTons);
  input.max = String(pending.maxStoreTons);
  input.value = String(pending.maxStoreTons);
  input.disabled = pending.minStoreTons === pending.maxStoreTons;
  el<HTMLElement>("plan-store-range").textContent =
    `${fmt(pending.minStoreTons)}·${fmt(pending.maxStoreTons)} t (affordable range; surviving old food must stay)`;
  updateAllocationPreview();
}

function updateAllocationPreview(): void {
  const pending = save.pendingTurn;
  if (!pending) return;
  const value = Number(el<HTMLInputElement>("plan-store").value);
  const valid =
    Number.isFinite(value) &&
    value >= pending.minStoreTons &&
    value <= pending.maxStoreTons;
  el<HTMLButtonElement>("allocate-btn").disabled = !valid;
  if (!valid) {
    el<HTMLElement>("allocation-preview").textContent =
      "Choose storage within the affordable range.";
    return;
  }
  const { report } = finishTurn(pending, value, CONFIG);
  el<HTMLElement>("allocation-preview").textContent =
    `Upkeep ${fmt(report.storageUpkeepCoins)} coins · total spending ${fmt(report.budgetSpentCoins)} coins · carry-over ${fmt(report.budgetCarryOverCoins)} coins · export ${fmt(report.exportTons)} t for ${fmt(report.exportIncomeCoins)} coins`;
}

function renderReport(result: TurnResult): void {
  const { report, state } = result;
  const section = el<HTMLElement>("report");
  section.hidden = false;

  el<HTMLElement>("report-year").textContent = String(report.year);
  el<HTMLElement>("report-event").textContent = eventSummary(report);
  el<HTMLElement>("report-harvest").textContent =
    `${fmt(report.harvestTons)} t`;
  el<HTMLElement>("report-consumption").textContent =
    `${fmt(report.consumptionTons)} t`;
  el<HTMLElement>("report-available").textContent =
    `${fmt(report.availableFoodTons)} t`;

  const famineEl = el<HTMLElement>("report-famine");
  famineEl.textContent =
    report.famine === "none" ? "No Famine" : `Famine (${report.famine})`;
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
  el<HTMLElement>("report-pop-change").textContent =
    `${fmt(report.populationStart)} → ${fmt(report.populationEnd)} (${delta >= 0 ? "+" : ""}${fmt(delta)})`;

  el<HTMLElement>("report-seeds").textContent = `-${fmt(report.seedCostCoins)}`;
  el<HTMLElement>("report-fertilizer").textContent =
    `-${fmt(report.fertilizerCostCoins)}`;
  el<HTMLElement>("report-prep").textContent =
    `-${fmt(report.landPrepCostCoins)}`;
  el<HTMLElement>("report-upkeep").textContent =
    `-${fmt(report.storageUpkeepCoins)}`;
  el<HTMLElement>("report-technologies").textContent =
    report.technologiesPurchased.length > 0
      ? `-${fmt(report.technologyCostCoins)} coins (${report.technologiesPurchased.map((id) => TECHNOLOGY_NAMES[id]).join(", ")})`
      : "—";
  el<HTMLElement>("report-export").textContent =
    `${fmt(report.exportTons)} t for +${fmt(report.exportIncomeCoins)} coins`;
  el<HTMLElement>("report-carryover").textContent =
    `${fmt(report.budgetCarryOverCoins)}`;
  el<HTMLElement>("report-tax").textContent =
    `+${fmt(report.budgetRevenueCoins)}`;
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
  el<HTMLElement>("collapse-length").textContent =
    `${turns} ${turns === 1 ? "Turn" : "Turns"}`;
  el<HTMLElement>("collapse-score").textContent = fmt(state.highestPopulation);
  el<HTMLElement>("collapse-cause").textContent =
    state.collapseCause === "totalFamine"
      ? "Total Famine: no food at all, the population reached zero."
      : `The population fell below half of the starting ${fmt(CONFIG.startingPopulation)}.`;
}

function render(): void {
  renderStats(save.state);
  renderCountry(save.state);
  renderPlan(save.state);
  renderAllocation();
  renderCollapse(save.state);
  renderEventLog();
}

function renderCountry(state: GameState): void {
  const green = el<SVGRectElement>("country-green");
  const latest = save.eventLog.at(-1);
  const cultivated =
    save.pendingTurn?.plan.cultivatedHectares ?? latest?.cultivatedHectares;
  const year = save.pendingTurn?.result.report.year ?? latest?.year;
  const fraction =
    cultivated !== undefined && state.arableLandHectares > 0
      ? Math.min(1, cultivated / state.arableLandHectares)
      : 0;
  const shape = el<SVGPathElement>("country-shape");
  const length = shape.getTotalLength();
  const points = Array.from({ length: 512 }, (_, i) =>
    shape.getPointAtLength((length * i) / 512),
  );
  const height = COUNTRY_VIEWBOX_HEIGHT - cultivationCut(points, fraction);
  green.setAttribute("y", String(COUNTRY_VIEWBOX_HEIGHT - height));
  green.setAttribute("height", String(height));

  // The same latest harvest supplies both cultivation and event tint, including pending allocation.
  const last = save.pendingTurn?.result.report ?? save.eventLog.at(-1);
  const tintedFlood = last?.event === "flood";
  const tintedDrought = last?.event === "drought";
  green.classList.toggle("flood", tintedFlood);
  green.classList.toggle("drought", tintedDrought);

  const caption =
    cultivated === undefined
      ? year === undefined
        ? "No harvest resolved yet."
        : `Year ${year}: cultivation was not recorded in this legacy save.`
      : `Year ${year}: ${fmt(cultivated)} of ${fmt(state.arableLandHectares)} ha cultivated (${Math.round(fraction * 100)}%). Latest harvest.`;
  green.style.display =
    cultivated === undefined || fraction === 0 ? "none" : "";
  el<HTMLElement>("country-caption").textContent = caption;
  el<SVGElement>("country-svg").setAttribute("aria-label", caption);
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
  if (save.state.collapsed || save.pendingTurn) return;
  const plan = readPlanInputs(save.state);
  if (!productionCosts(save.state, plan, CONFIG).affordable) return;
  save.pendingTurn = beginTurn(
    save.state,
    plan,
    turnSeed(save.runSeed, save.state.year),
    CONFIG,
  );
  persist(save);
  render();
}

function confirmAllocation(): void {
  const pending = save.pendingTurn;
  if (!pending) return;
  const amount = Number(el<HTMLInputElement>("plan-store").value);
  if (
    !Number.isFinite(amount) ||
    amount < pending.minStoreTons ||
    amount > pending.maxStoreTons
  )
    return;
  const result = finishTurn(pending, amount, CONFIG);
  save.state = result.state;
  delete save.pendingTurn;
  save.eventLog.push({
    year: result.report.year,
    event: result.report.event,
    summary: eventSummary(result.report),
    cultivatedHectares: pending.plan.cultivatedHectares,
  });
  persist(save);
  renderReport(result);
  render();
}

function restart(): void {
  if (
    !window.confirm(
      "Restart from the beginning? Your current run will be lost.",
    )
  )
    return;
  save = newSave();
  persist(save);
  el<HTMLElement>("report").hidden = true;
  render();
}

function init(): void {
  for (const id of ["plan-hectares", "plan-fertilizer", "plan-prep"]) {
    el<HTMLInputElement>(id).addEventListener("input", () =>
      updatePlanPreview(save.state),
    );
  }
  for (const techId of TECHNOLOGY_IDS) {
    el<HTMLInputElement>(`tech-${techId}`).addEventListener("change", () =>
      updatePlanPreview(save.state),
    );
  }
  el<HTMLInputElement>("plan-store").addEventListener(
    "input",
    updateAllocationPreview,
  );
  el<HTMLButtonElement>("allocate-btn").addEventListener(
    "click",
    confirmAllocation,
  );
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  render();
}

init();
