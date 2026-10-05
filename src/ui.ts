import { createLandscape, renderLandscape } from "./landscape.js";
import { foodBarLayout, foodOutlook } from "./outlook.js";
import { GameSound } from "./sound.js";
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

// DOM presentation around the deterministic simulation and durable two-decision Turn.

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

const loadedSave = loadSave();
let save: SaveData = loadedSave ?? newSave();
let readFailed = loadedSave === undefined;
let saveFailed = false;
let restartCandidate: SaveData | undefined;
let planEdited = false;
const sound = new GameSound();

function text(id: string, value: string): void {
  el<HTMLElement>(id).textContent = value;
}

function foodBalance(tons: number): string {
  return tons >= 0 ? `${fmt(tons)} t Surplus` : `${fmt(-tons)} t shortfall`;
}

function focusPanel(id: string): void {
  const panel = el<HTMLElement>(id);
  const heading = panel.querySelector<HTMLElement>("h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  panel.scrollIntoView({ block: "start" });
}

function persistenceBlocked(): boolean {
  return readFailed || saveFailed || restartCandidate !== undefined;
}

function renderSaveStatus(): void {
  el<HTMLElement>("save-notice").hidden = !persistenceBlocked();
  el<HTMLElement>("save-status").textContent = readFailed
    ? "Could not read your saved run. Play is paused to protect it. Retry loading when browser storage is available."
    : restartCandidate
      ? "Restart was not saved. Your current run is still displayed and the previous save is unchanged. Retry to complete Restart."
      : saveFailed
        ? "Progress is not saved. This result is only in this tab; closing or reloading will lose it. Play is paused. Retry saving to continue."
        : "";
  el<HTMLButtonElement>("restart-btn").disabled = persistenceBlocked();
  el<HTMLButtonElement>("collapse-restart-btn").disabled = persistenceBlocked();
}

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
  const opening = save.pendingTurn ? "Opening " : "";
  text("population-label", `${opening}Population`);
  text("storage-label", `${opening}Storage`);
  text("budget-label", `${opening}Budget`);
  text("price-label", `${opening}World price`);
}

function renderRhythm(): void {
  const active = save.pendingTurn
    ? "allocate"
    : save.state.collapsed
      ? "report"
      : "plan";
  for (const step of ["plan", "allocate", "report"]) {
    const node = el<HTMLElement>(`step-${step}`);
    if (step === active) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  }
  const latest = save.eventLog.at(-1);
  text(
    "turn-status",
    save.state.collapsed
      ? "Run complete · start a new country when you're ready"
      : save.pendingTurn
        ? `Year ${save.state.year} Harvest committed · choose Storage to finish`
        : latest
          ? `Year ${latest.year} complete · plan Year ${save.state.year}`
          : "Your first Year · plan a Harvest to feed your people",
  );
}

function renderPlan(state: GameState): void {
  el<HTMLElement>("plan-fert-yield").textContent = fmtRate(
    CONFIG.fertilizerYieldMultiplier,
  );
  const effects: Record<TechnologyId, string> = {
    irrigation: `Drought Yield loss ×${fmtRate(CONFIG.irrigationDroughtLossMultiplier)}`,
    highYieldSeeds: `Base Yield ×${fmtRate(CONFIG.highYieldSeedsYieldMultiplier)}`,
    granary: `Storage upkeep ×${fmtRate(CONFIG.granaryUpkeepMultiplier)}`,
    tradeRoutes: `Export price ×${fmtRate(CONFIG.tradeRoutesPriceMultiplier)}`,
    landSurvey: `Land preparation cost ×${fmtRate(CONFIG.landSurveyCostMultiplier)}`,
    fertilizerWorks: `Fertilizer cost ×${fmtRate(CONFIG.fertilizerWorksCostMultiplier)}`,
  };
  const benefit = (multiplier: number, subject: string) => {
    const percent = Math.round(Math.abs(multiplier - 1) * 100);
    return `${percent}% ${multiplier <= 1 ? "less" : "more"} ${subject}`;
  };
  const benefits: Record<TechnologyId, string> = {
    irrigation: benefit(
      CONFIG.irrigationDroughtLossMultiplier,
      "Yield lost to drought",
    ),
    highYieldSeeds: benefit(
      CONFIG.highYieldSeedsYieldMultiplier,
      "food per hectare",
    ),
    granary: benefit(CONFIG.granaryUpkeepMultiplier, "Storage upkeep"),
    tradeRoutes: benefit(
      CONFIG.tradeRoutesPriceMultiplier,
      "Export income per ton",
    ),
    landSurvey: benefit(
      CONFIG.landSurveyCostMultiplier,
      "land preparation cost",
    ),
    fertilizerWorks: benefit(
      CONFIG.fertilizerWorksCostMultiplier,
      "fertilizer cost",
    ),
  };
  text("plan-seed-price", fmtRate(CONFIG.seedCostPerHectare));
  el<HTMLElement>("first-plan").hidden =
    state.year !== 1 || save.eventLog.length > 0;
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
    const row = checkbox.closest(".tech-row");
    const cost = row?.querySelector(".tech-cost");
    const effect = row?.querySelector(".tech-effect");
    if (cost) cost.textContent = `${fmtRate(CONFIG.technologyCosts[id])} coins`;
    if (effect) effect.textContent = effects[id];
    text(`tech-${id}-benefit`, benefits[id]);
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
  const fertilizerInput = el<HTMLInputElement>("plan-fertilizer");
  fertilizerInput.max = String(plan.cultivatedHectares);
  if (fertilizerInput.valueAsNumber > plan.cultivatedHectares) {
    fertilizerInput.value = String(plan.fertilizedHectares);
  }
  const fields: Record<string, number> = {
    "plan-hectares": plan.cultivatedHectares,
    "plan-fertilizer": plan.fertilizedHectares,
    "plan-prep": plan.preparedHectares,
  };
  for (const [id, value] of Object.entries(fields)) {
    const input = el<HTMLInputElement>(id);
    if (Number.isFinite(input.valueAsNumber) && input.valueAsNumber !== value) {
      input.value = String(value);
    }
    const slider = el<HTMLInputElement>(`${id}-slider`);
    slider.max = input.max;
    slider.value = String(value);
  }

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
  const complete = Object.keys(fields).every(
    (id) => el<HTMLInputElement>(id).value !== "",
  );
  el<HTMLButtonElement>("confirm-btn").disabled =
    !complete || !costs.affordable || state.collapsed || persistenceBlocked();

  el<HTMLElement>("plan-upkeep-cost").textContent = fmt(costs.upkeep);
  el<HTMLElement>("budget-summary").classList.toggle(
    "over-budget",
    !costs.affordable,
  );
  el<HTMLElement>("budget-bar").style.width =
    `${Math.min(100, (totalCost / Math.max(1, state.budgetCoins)) * 100)}%`;
  el<HTMLElement>("budget-meter").setAttribute(
    "aria-label",
    `Planned spending ${fmt(totalCost)} coins; opening Budget ${fmt(state.budgetCoins)} coins`,
  );
  const error = el<HTMLElement>("plan-error");
  error.hidden = complete && costs.affordable;
  error.textContent = !complete
    ? "Enter a number in each hectares field."
    : `Plan exceeds the available Budget. Reduce spending before resolving.`;
  for (const id of TECHNOLOGY_IDS) {
    const checkbox = el<HTMLInputElement>(`tech-${id}`);
    const owned = state.ownedTechnologies.includes(id);
    const shortfall = CONFIG.technologyCosts[id] - Math.max(0, remaining);
    const unaffordable = !owned && !checkbox.checked && shortfall > 1e-8;
    const row = checkbox.closest(".tech-row");
    row?.classList.toggle("selected", checkbox.checked && !owned);
    row?.classList.toggle("owned", owned);
    row?.classList.toggle("unaffordable", unaffordable);
    text(
      `tech-${id}-status`,
      owned
        ? ""
        : checkbox.checked
          ? "Selected · starts next Turn"
          : unaffordable
            ? `Need ${fmtRate(shortfall)} more coins`
            : "Available · starts next Turn",
    );
  }
  renderOutlook(state, plan);
  if (!save.pendingTurn && !state.collapsed) {
    renderCountry(
      state,
      planEdited || save.eventLog.length === 0 ? plan : undefined,
    );
  }
}

function renderOutlook(state: GameState, plan: PlayerPlan): void {
  const outlook = foodOutlook(state, plan, CONFIG);
  const { ordinary, drought, consumptionTons } = outlook;
  const bar = foodBarLayout(outlook);
  text("forecast-available", `${fmt(ordinary.availableFoodTons)} t`);
  text("forecast-harvest", `${fmt(ordinary.harvestTons)} t`);
  text("forecast-storage", `${fmt(ordinary.storageTons)} t`);
  text("forecast-consumption", `${fmt(consumptionTons)} t`);
  const balance = foodBalance(ordinary.balanceTons);
  text("forecast-balance", `${balance} before Events`);
  el<HTMLElement>("forecast-balance").classList.toggle(
    "shortfall",
    ordinary.balanceTons < 0,
  );
  text(
    "forecast-drought-outcome",
    `Drought: ${fmt(drought.harvestTons)} t Harvest · ${foodBalance(drought.balanceTons)}`,
  );
  el<HTMLElement>("forecast-harvest-bar").style.width =
    `${bar.harvestPercent}%`;
  el<HTMLElement>("forecast-storage-bar").style.width =
    `${bar.storagePercent}%`;
  el<HTMLElement>("forecast-shortfall-bar").style.width =
    `${bar.shortfallPercent}%`;
  el<HTMLElement>("forecast-consumption-marker").style.left =
    `${bar.consumptionPercent}%`;
  text(
    "forecast-food-description",
    `Available food ${fmt(ordinary.availableFoodTons)} tons (Harvest ${fmt(ordinary.harvestTons)} tons plus opening Storage ${fmt(ordinary.storageTons)} tons) against Consumption ${fmt(consumptionTons)} tons: ${fmt(Math.abs(ordinary.balanceTons))} tons ${ordinary.balanceTons >= 0 ? "Surplus" : "shortfall"} before Events.`,
  );
  for (const scenario of ["ordinary", "drought", "flood"] as const) {
    text(
      `forecast-${scenario}-harvest`,
      `${fmt(outlook[scenario].harvestTons)} t`,
    );
    text(
      `forecast-${scenario}-balance`,
      foodBalance(outlook[scenario].balanceTons),
    );
  }
  text(
    "forecast-flood-note",
    `Flood scenario includes ${fmt(state.storageTons - outlook.flood.storageTons)} t of opening Storage lost. Purchases and new land preparation take effect next Turn.`,
  );
}

function renderAllocation(): void {
  const pending = save.pendingTurn;
  el<HTMLElement>("allocation").hidden = !pending;
  el<HTMLElement>("production").hidden = !!pending || save.state.collapsed;
  el<HTMLElement>("technologies").hidden = !!pending || save.state.collapsed;
  if (!pending) return;
  const { report } = pending.result;
  el<HTMLElement>("allocation-year").textContent = String(report.year);
  el<HTMLElement>("allocation-event").textContent = eventSummary(report);
  const events = {
    none: ["An ordinary year", "sun"],
    drought: ["Drought", "sun"],
    flood: ["Flood", "rain"],
    priceShock: ["An Export price shock", "trade"],
  };
  text("allocation-event-title", events[report.event][0] ?? "");
  el<SVGUseElement>("allocation-event-icon").setAttribute(
    "href",
    `#icon-${events[report.event][1]}`,
  );
  el<HTMLElement>("event-reveal").classList.toggle(
    "famine",
    report.famine !== "none",
  );
  text(
    "allocation-outcome",
    report.famine === "none"
      ? "Your people are fed"
      : report.famine === "total"
        ? "No food. Total Famine."
        : "Famine: food falls short",
  );
  const change = report.populationEnd - report.populationStart;
  text(
    "allocation-population-change",
    `Population ${fmt(report.populationStart)} → ${fmt(report.populationEnd)} (${change >= 0 ? "+" : ""}${fmt(change)})`,
  );
  el<HTMLElement>("allocation-harvest").textContent =
    `${fmt(report.harvestTons)} t`;
  el<HTMLElement>("allocation-consumption").textContent =
    `${fmt(report.consumptionTons)} t needed · Famine: ${report.famine}`;
  el<HTMLElement>("allocation-surplus").textContent =
    `${fmt(Math.max(0, report.availableFoodTons - report.consumptionTons))} t`;
  el<HTMLElement>("allocation-price").textContent =
    `${report.exportPriceCoins.toFixed(2)} coins/t`;
  const input = el<HTMLInputElement>("plan-store");
  input.min = String(pending.minStoreTons);
  input.max = String(pending.maxStoreTons);
  input.value = String(pending.maxStoreTons);
  input.disabled = pending.minStoreTons === pending.maxStoreTons;
  const slider = el<HTMLInputElement>("plan-store-slider");
  slider.min = input.min;
  slider.max = input.max;
  slider.value = input.value;
  slider.disabled = input.disabled;
  for (const id of ["store-min-btn", "store-max-btn"]) {
    el<HTMLButtonElement>(id).disabled = input.disabled || persistenceBlocked();
  }
  text("plan-upkeep-price", fmtRate(pending.storageUpkeepPerTon));
  el<HTMLElement>("plan-store-range").textContent =
    `${fmtRate(pending.minStoreTons)}–${fmtRate(pending.maxStoreTons)} t affordable range`;
  text(
    "allocation-retained",
    pending.minStoreTons > 0
      ? `${fmtRate(pending.minStoreTons)} t of surviving old food must stay in Storage and cannot be exported.`
      : pending.maxStoreTons === 0
        ? "No affordable Surplus remains to store. Finish the Year to record the outcome."
        : "Keeping food buffers future shortfalls; exporting funds future investment.",
  );
  updateAllocationPreview();
}

function updateAllocationPreview(): void {
  const pending = save.pendingTurn;
  if (!pending) return;
  const input = el<HTMLInputElement>("plan-store");
  const value = input.valueAsNumber;
  const valid =
    Number.isFinite(value) &&
    value >= pending.minStoreTons &&
    value <= pending.maxStoreTons;
  el<HTMLButtonElement>("allocate-btn").disabled =
    !valid || persistenceBlocked();
  el<HTMLElement>("allocation-error").hidden = valid;
  el<HTMLElement>("allocation-totals").hidden = !valid;
  const slider = el<HTMLInputElement>("plan-store-slider");
  if (Number.isFinite(value))
    slider.value = String(
      Math.max(pending.minStoreTons, Math.min(pending.maxStoreTons, value)),
    );
  if (!valid) {
    el<HTMLElement>("allocation-preview").textContent =
      "Choose storage within the affordable range.";
    text("allocation-error", "Choose Storage within the affordable range.");
    return;
  }
  const { report, state } = finishTurn(pending, value, CONFIG);
  text("allocation-stored", `${fmtRate(value)} t`);
  text("allocation-exported", `${fmt(report.exportTons)} t`);
  text("allocation-income", `${fmt(report.exportIncomeCoins)} coins`);
  text("allocation-upkeep", `${fmt(report.storageUpkeepCoins)} coins`);
  text("allocation-next-budget", `${fmt(state.budgetCoins)} coins`);
  el<HTMLElement>("allocation-preview").textContent =
    `Upkeep ${fmt(report.storageUpkeepCoins)} coins · total spending ${fmt(report.budgetSpentCoins)} coins · carry-over ${fmt(report.budgetCarryOverCoins)} coins · export ${fmt(report.exportTons)} t for ${fmt(report.exportIncomeCoins)} coins`;
}

function renderReport(result: TurnResult): void {
  const { report, state } = result;
  const section = el<HTMLElement>("report");
  section.hidden = !!save.pendingTurn;
  section.classList.toggle("famine", report.famine !== "none");
  if (el<HTMLElement>("report-year").textContent !== String(report.year)) {
    el<HTMLDetailsElement>("report-details").open = false;
  }

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
  text(
    "report-headline",
    delta >= 0 ? `${fmt(delta)} more people` : `${fmt(-delta)} people lost`,
  );
  text(
    "report-population-summary",
    `Population ${fmt(report.populationStart)} → ${fmt(report.populationEnd)} · peak ${fmt(state.highestPopulation)}`,
  );
  text("report-storage-summary", `${fmt(state.storageTons)} t`);
  text("report-budget-summary", `${fmt(state.budgetCoins)} coins`);
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
  text("collapse-event", save.eventLog.at(-1)?.summary ?? "");
  el<HTMLElement>("collapse-cause").textContent =
    state.collapseCause === "totalFamine"
      ? "Total Famine: no food at all, the population reached zero."
      : `The population fell below half of the starting ${fmt(CONFIG.startingPopulation)}.`;
}

function render(): void {
  const latest = save.eventLog.at(-1)?.result;
  if (latest) renderReport(latest);
  else el<HTMLElement>("report").hidden = true;
  renderStats(save.state);
  renderPlan(save.state);
  renderCountry(
    save.state,
    !save.pendingTurn &&
      !save.state.collapsed &&
      (planEdited || save.eventLog.length === 0)
      ? readPlanInputs(save.state)
      : undefined,
  );
  renderAllocation();
  renderCollapse(save.state);
  renderEventLog();
  renderSaveStatus();
  renderRhythm();
}

function renderCountry(state: GameState, preview?: PlayerPlan): void {
  const latest = save.eventLog.at(-1);
  const cultivated =
    preview?.cultivatedHectares ??
    save.pendingTurn?.plan.cultivatedHectares ??
    latest?.cultivatedHectares;
  const year = save.pendingTurn?.result.report.year ?? latest?.year;
  const fraction =
    cultivated !== undefined && state.arableLandHectares > 0
      ? Math.min(1, cultivated / state.arableLandHectares)
      : 0;
  const last = save.pendingTurn?.result.report ?? save.eventLog.at(-1);
  const population =
    save.pendingTurn?.result.report.populationEnd ?? state.population;
  renderLandscape(
    el<SVGSVGElement>("country-svg"),
    state,
    cultivated,
    preview ? "none" : (last?.event ?? "none"),
    population,
  );
  const caption = preview
    ? `Year ${state.year} plan preview: ${fmt(cultivated ?? 0)} of ${fmt(state.arableLandHectares)} ha cultivated (${Math.round(fraction * 100)}%).${preview.preparedHectares > 0 ? ` ${fmt(preview.preparedHectares)} new ha available next Turn.` : ""}`
    : cultivated === undefined
      ? year === undefined
        ? "No harvest resolved yet."
        : `Year ${year}: cultivation was not recorded in this legacy save.`
      : `Year ${year}: ${fmt(cultivated)} of ${fmt(state.arableLandHectares)} ha cultivated (${Math.round(fraction * 100)}%). Latest harvest.`;
  el<HTMLElement>("country-caption").textContent = caption;
  el<SVGElement>("country-svg").setAttribute("aria-label", caption);
  text("country-mode", preview ? "Plan preview" : "Latest Harvest");
  text(
    "land-cultivated",
    cultivated === undefined ? "Unknown" : `${fmt(cultivated)} ha`,
  );
  text("land-prepared", `${fmt(state.preparedLandHectares)} ha`);
  text(
    "land-unprepared",
    `${fmt(state.arableLandHectares - state.preparedLandHectares)} ha`,
  );
  const level = Math.max(
    1,
    Math.floor(
      Math.log2(
        Math.max(1, state.highestPopulation / CONFIG.startingPopulation),
      ),
    ) + 1,
  );
  const threshold = CONFIG.startingPopulation * 2 ** level;
  text("milestone-target", `${fmt(threshold)} people`);
  const progress = el<HTMLProgressElement>("milestone-progress");
  progress.max = threshold;
  progress.value = Math.min(population, threshold);
  progress.setAttribute(
    "aria-valuetext",
    `${fmt(population)} of ${fmt(threshold)} people`,
  );
  text(
    "milestone-caption",
    `Population doubles at each Milestone · Score ${fmt(state.highestPopulation)}`,
  );
  text(
    "country-technologies",
    state.ownedTechnologies.length
      ? `In your landscape: ${state.ownedTechnologies.map((id) => TECHNOLOGY_NAMES[id]).join(", ")}`
      : "Grow your settlement and add Technology landmarks.",
  );
}

function renderEventLog(): void {
  const list = el<HTMLElement>("event-log");
  list.textContent = "";
  el<HTMLElement>("empty-history").hidden = save.eventLog.length > 0;
  for (const entry of save.eventLog) {
    const item = document.createElement("li");
    item.className = entry.event;
    item.textContent = `Year ${entry.year}: ${entry.summary}`;
    if (entry.result) {
      const { state, report } = entry.result;
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `Outcomes: population ${fmt(report.populationStart)} → ${fmt(report.populationEnd)} · Famine: ${report.famine}`;
      const body = document.createElement("p");
      body.textContent = `Harvest ${fmt(report.harvestTons)} t · Consumption ${fmt(report.consumptionTons)} t · Storage ${fmt(state.storageTons)} t · Export ${fmt(report.exportTons)} t for ${fmt(report.exportIncomeCoins)} coins · Budget ${fmt(state.budgetCoins)} coins · Score ${fmt(state.highestPopulation)}${state.collapsed ? " · Collapse" : ""}`;
      details.append(summary, body);
      item.appendChild(details);
    }
    list.appendChild(item);
  }
}

function confirmPlan(): void {
  if (persistenceBlocked() || save.state.collapsed || save.pendingTurn) return;
  const plan = readPlanInputs(save.state);
  if (!productionCosts(save.state, plan, CONFIG).affordable) return;
  save.pendingTurn = beginTurn(
    save.state,
    plan,
    turnSeed(save.runSeed, save.state.year),
    CONFIG,
  );
  planEdited = false;
  saveFailed = !persist(save);
  render();
  void sound.play("harvest");
  focusPanel("allocation");
}

function confirmAllocation(): void {
  const pending = save.pendingTurn;
  if (!pending || persistenceBlocked()) return;
  const amount = el<HTMLInputElement>("plan-store").valueAsNumber;
  if (
    !Number.isFinite(amount) ||
    amount < pending.minStoreTons ||
    amount > pending.maxStoreTons
  )
    return;
  const result = finishTurn(pending, amount, CONFIG);
  save.state = result.state;
  planEdited = false;
  delete save.pendingTurn;
  save.eventLog.push({
    year: result.report.year,
    event: result.report.event,
    summary: eventSummary(result.report),
    cultivatedHectares: pending.plan.cultivatedHectares,
    result,
  });
  saveFailed = !persist(save);
  renderReport(result);
  render();
  void sound.play(
    result.report.milestoneLevel !== null
      ? "milestone"
      : result.report.famine === "none"
        ? "growth"
        : "famine",
  );
  focusPanel(save.state.collapsed ? "collapse-summary" : "report");
}

function restart(): void {
  if (persistenceBlocked()) return;
  if (
    !window.confirm(
      "Restart from the beginning? Your current run will be lost.",
    )
  )
    return;
  restartCandidate = newSave();
  retryPersistence();
}

function retryPersistence(): void {
  if (readFailed) {
    const loaded = loadSave();
    readFailed = loaded === undefined;
    if (!readFailed) save = loaded ?? newSave();
  } else if (restartCandidate) {
    if (persist(restartCandidate)) {
      save = restartCandidate;
      planEdited = false;
      restartCandidate = undefined;
      el<HTMLElement>("report").hidden = true;
    }
  } else {
    saveFailed = !persist(save);
  }
  render();
}

function init(): void {
  createLandscape(el<SVGSVGElement>("country-svg"));
  el<HTMLButtonElement>("retry-save-btn").addEventListener(
    "click",
    retryPersistence,
  );
  for (const id of ["plan-hectares", "plan-fertilizer", "plan-prep"]) {
    el<HTMLInputElement>(id).addEventListener("input", () => {
      planEdited = true;
      updatePlanPreview(save.state);
    });
    el<HTMLInputElement>(`${id}-slider`).addEventListener("input", () => {
      el<HTMLInputElement>(id).value = el<HTMLInputElement>(
        `${id}-slider`,
      ).value;
      planEdited = true;
      updatePlanPreview(save.state);
    });
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
  el<HTMLInputElement>("plan-store-slider").addEventListener("input", () => {
    el<HTMLInputElement>("plan-store").value =
      el<HTMLInputElement>("plan-store-slider").value;
    updateAllocationPreview();
  });
  for (const [id, bound] of [
    ["store-min-btn", "minStoreTons"],
    ["store-max-btn", "maxStoreTons"],
  ] as const) {
    el<HTMLButtonElement>(id).addEventListener("click", () => {
      if (!save.pendingTurn) return;
      el<HTMLInputElement>("plan-store").value = String(
        save.pendingTurn[bound],
      );
      updateAllocationPreview();
    });
  }
  el<HTMLButtonElement>("cultivate-all-btn").addEventListener("click", () => {
    el<HTMLInputElement>("plan-hectares").value = String(
      save.state.preparedLandHectares,
    );
    planEdited = true;
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("fertilize-all-btn").addEventListener("click", () => {
    el<HTMLInputElement>("plan-fertilizer").value = String(
      readPlanInputs(save.state).cultivatedHectares,
    );
    planEdited = true;
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("suggest-plan-btn").addEventListener("click", () => {
    for (const id of ["plan-hectares", "plan-fertilizer"]) {
      el<HTMLInputElement>(id).value = String(save.state.preparedLandHectares);
    }
    planEdited = true;
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("sound-btn").addEventListener("click", () => {
    sound.setEnabled(!sound.enabled);
    el<HTMLButtonElement>("sound-btn").setAttribute(
      "aria-pressed",
      String(sound.enabled),
    );
    text("sound-label", sound.enabled ? "Sound on" : "Sound off");
    void sound.play("growth");
  });
  el<HTMLButtonElement>("allocate-btn").addEventListener(
    "click",
    confirmAllocation,
  );
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  el<HTMLButtonElement>("collapse-restart-btn").addEventListener(
    "click",
    restart,
  );
  render();
}

init();
