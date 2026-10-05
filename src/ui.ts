import {
  createLandscape,
  renderLandscape,
  settleLandscape,
  villageHouses,
} from "./landscape.js";
import { foodBarLayout, foodOutlook } from "./outlook.js";
import { resourceHeader } from "./header.js";
import { outcomeHeadline, populationChange } from "./outcome.js";
import { restartWarning } from "./restart.js";
import { GameSound } from "./sound.js";
import {
  affordableHectares,
  beginTurn,
  finishTurn,
  productionCosts,
} from "./turn.js";
import type { ProductionInput } from "./turn.js";
import { economyRates } from "./economy.js";
import { carriedPlan } from "./carryover.js";
import { collapseSummary } from "./collapse.js";
import { CONFIG } from "./config.js";
import { eventSummary } from "./simulation.js";
import { technologyBenefit, technologyStatus } from "./technology.js";
import { chronicleRows, UNKNOWN } from "./chronicle.js";
import {
  coinRate,
  coins,
  exactCoins,
  exactTons,
  formatCount as fmt,
  formatDecimal as fmtRate,
  hectares,
  tons,
} from "./format.js";
import type {
  GameState,
  PlayerPlan,
  TechnologyId,
  TurnResult,
} from "./types.js";
import { overspendBlame } from "./overspend.js";
import type { PlanChange } from "./overspend.js";
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
// The plan control changed most recently; an overspend is reported there.
let lastPlanChange: PlanChange | undefined;
const sound = new GameSound();

function text(id: string, value: string): void {
  el<HTMLElement>(id).textContent = value;
}

function foodBalance(balance: number): string {
  return balance >= 0
    ? `${tons(balance)} Surplus`
    : `${tons(-balance)} shortfall`;
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

function renderStats(): void {
  const header = resourceHeader(save);
  text("stat-year", header.year);
  text("stat-population", header.population);
  text("stat-population-change", header.populationChange);
  text("stat-storage", header.storage);
  text("stat-budget", header.budget);
  el<HTMLElement>("stats-note").hidden = !header.opening;
  text("turn-status", header.status);
}

function renderPlan(state: GameState): void {
  el<HTMLElement>("plan-fert-yield").textContent = fmtRate(
    CONFIG.fertilizerYieldMultiplier,
  );
  text("plan-seed-price", coinRate(CONFIG.seedCostPerHectare, "ha"));
  el<HTMLElement>("first-plan").hidden =
    state.year !== 1 || save.eventLog.length > 0;
  el<HTMLElement>("plan-year").textContent = String(state.year);
  const maxHectares = state.preparedLandHectares;
  el<HTMLElement>("plan-max").textContent = fmt(maxHectares);
  el<HTMLElement>("plan-fert-price").textContent = coinRate(
    economyRates(state, CONFIG).fertilizer,
    "ha",
  );
  const maxPrep = state.arableLandHectares - state.preparedLandHectares;
  el<HTMLElement>("plan-prep-max").textContent = hectares(maxPrep);
  el<HTMLElement>("plan-prep-price").textContent = coinRate(
    economyRates(state, CONFIG).preparation,
    "ha",
  );
  el<HTMLElement>("plan-upkeep-price").textContent = coinRate(
    economyRates(state, CONFIG).upkeep,
    "t",
  );

  // Each Year opens with the previous Year's production, clamped to what fits.
  const opening = carriedPlan(state, save.eventLog.at(-1), CONFIG);
  const input = el<HTMLInputElement>("plan-hectares");
  input.max = String(maxHectares);
  input.value = String(opening.cultivatedHectares);
  const fertilizerInput = el<HTMLInputElement>("plan-fertilizer");
  fertilizerInput.max = String(maxHectares);
  fertilizerInput.value = String(opening.fertilizedHectares);
  const prepInput = el<HTMLInputElement>("plan-prep");
  prepInput.max = String(maxPrep);
  prepInput.value = "0";

  const owned = new Set(state.ownedTechnologies);
  for (const id of TECHNOLOGY_IDS) {
    const checkbox = el<HTMLInputElement>(`tech-${id}`);
    text(`tech-${id}-cost`, exactCoins(CONFIG.technologyCosts[id]));
    text(`tech-${id}-benefit`, technologyBenefit(id, CONFIG));
    // Owned Technologies are locked in; unowned ones start unchecked each Turn.
    checkbox.checked = owned.has(id);
    checkbox.disabled = owned.has(id);
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
  el<HTMLElement>("plan-seed-cost").textContent = coins(seedCost);
  el<HTMLElement>("plan-fert-cost").textContent = coins(fertilizerCost);
  el<HTMLElement>("plan-prep-cost").textContent = coins(prepCost);
  el<HTMLElement>("plan-tech-cost").textContent = coins(technologyCost);
  el<HTMLElement>("plan-total-cost").textContent = coins(totalCost);

  const remaining = state.budgetCoins - totalCost;
  const remainingEl = el<HTMLElement>("plan-remaining");
  remainingEl.textContent = coins(remaining);
  remainingEl.classList.toggle("overspend", remaining < 0);
  const complete = Object.keys(fields).every(
    (id) => el<HTMLInputElement>(id).value !== "",
  );
  el<HTMLButtonElement>("confirm-btn").disabled =
    !complete || !costs.affordable || state.collapsed || persistenceBlocked();

  el<HTMLElement>("plan-upkeep-cost").textContent = coins(costs.upkeep);
  el<HTMLElement>("budget-summary").classList.toggle(
    "over-budget",
    !costs.affordable,
  );
  el<HTMLElement>("budget-bar").style.width =
    `${Math.min(100, (totalCost / Math.max(1, state.budgetCoins)) * 100)}%`;
  el<HTMLElement>("budget-meter").setAttribute(
    "aria-label",
    `Planned spending ${coins(totalCost)}; opening Budget ${coins(state.budgetCoins)}`,
  );
  const error = el<HTMLElement>("plan-error");
  error.hidden = complete && costs.affordable;
  error.textContent = !complete
    ? "Enter a number in each hectares field."
    : `Plan exceeds the available Budget. Reduce spending before resolving.`;
  const limits = productionLimits(state, plan);
  const blame = overspendBlame({
    overBudget: complete && !costs.affordable,
    lastChange: lastPlanChange,
    overInputs: limits.filter((l) => l.value > l.max).map((l) => l.input),
    selectedTechnologies: plan.purchaseTechnologies ?? [],
  });
  renderProductionLimits(limits, blame.inputs);
  for (const id of TECHNOLOGY_IDS) {
    const checkbox = el<HTMLInputElement>(`tech-${id}`);
    const status = technologyStatus({
      owned: state.ownedTechnologies.includes(id),
      selected: checkbox.checked,
      shortfall: CONFIG.technologyCosts[id] - Math.max(0, remaining),
    });
    const row = checkbox.closest(".tech-row");
    for (const kind of ["selected", "owned", "unaffordable"] as const) {
      row?.classList.toggle(kind, status.kind === kind);
    }
    const statusEl = el<HTMLElement>(`tech-${id}-status`);
    statusEl.textContent = status.text;
    statusEl.hidden = status.text === "";
    renderFieldError(
      `tech-${id}`,
      id === blame.technology
        ? `Over Budget by ${exactCoins(-remaining)}`
        : undefined,
    );
  }
  renderOutlook(state, plan);
  renderResolveButton(state, plan);
  if (!save.pendingTurn) {
    const balance = foodOutlook(state, plan, CONFIG).ordinary.balanceTons;
    renderCommitBar("confirm-btn", [
      {
        label: "Food",
        value: foodBalance(balance),
        alert: balance < 0 ? "shortfall" : undefined,
      },
      {
        label: "Budget after plan",
        value: coins(remaining),
        alert: remaining < 0 ? "overspend" : undefined,
      },
    ]);
  }
  if (!save.pendingTurn && !state.collapsed) {
    renderCountry(
      state,
      planEdited || save.eventLog.length === 0 ? plan : undefined,
    );
  }
}

const PRODUCTION_INPUTS: Record<string, ProductionInput> = {
  "plan-hectares": "cultivatedHectares",
  "plan-fertilizer": "fertilizedHectares",
  "plan-prep": "preparedHectares",
};

interface ProductionLimit {
  id: string;
  input: ProductionInput;
  max: number;
  value: number;
}

// Each production input's affordable maximum alongside its planned value.
function productionLimits(
  state: GameState,
  plan: PlayerPlan,
): ProductionLimit[] {
  return Object.entries(PRODUCTION_INPUTS).map(([id, input]) => ({
    id,
    input,
    max: affordableHectares(state, plan, input, CONFIG),
    value: plan[input],
  }));
}

/** Show a control's inline error, linked to it by aria-describedby, or clear
 * it when `message` is undefined. */
function renderFieldError(
  controlId: string,
  message: string | undefined,
): void {
  const error = el<HTMLElement>(`${controlId}-error`);
  error.hidden = message === undefined;
  // Hidden text still counts in aria-describedby, so clear it as well.
  error.textContent = message ?? "";
  el<HTMLInputElement>(controlId).setAttribute(
    "aria-invalid",
    String(message !== undefined),
  );
}

/** Show each input's affordable maximum, tint the unaffordable slider range and
 * put the overspend message at the blamed inputs (see `overspendBlame`). */
function renderProductionLimits(
  limits: readonly ProductionLimit[],
  blamed: readonly ProductionInput[],
): void {
  for (const { id, input, max } of limits) {
    text(`${id}-affordable`, `Up to ${hectares(max)} affordable`);
    const range = Number(el<HTMLInputElement>(`${id}-slider`).max);
    el<HTMLElement>(`${id}-range`).style.setProperty(
      "--affordable",
      String(range > 0 ? Math.min(1, max / range) : 1),
    );
    renderFieldError(
      id,
      blamed.includes(input)
        ? `Over Budget: at most ${hectares(max)} is affordable with the rest of this plan.`
        : undefined,
    );
  }
}

function renderOutlook(state: GameState, plan: PlayerPlan): void {
  const outlook = foodOutlook(state, plan, CONFIG);
  const { ordinary, drought, consumptionTons } = outlook;
  const bar = foodBarLayout(outlook);
  text("forecast-available", tons(ordinary.availableFoodTons));
  text("forecast-harvest", tons(ordinary.harvestTons));
  text("forecast-storage", tons(ordinary.storageTons));
  text("forecast-consumption", tons(consumptionTons));
  text(
    "forecast-balance",
    `${foodBalance(ordinary.balanceTons)} before Events`,
  );
  el<HTMLElement>("forecast-balance").classList.toggle(
    "shortfall",
    ordinary.balanceTons < 0,
  );
  text(
    "forecast-drought-outcome",
    `Drought: ${tons(drought.harvestTons)} Harvest · ${foodBalance(drought.balanceTons)}`,
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
    text(`forecast-${scenario}-harvest`, tons(outlook[scenario].harvestTons));
    text(
      `forecast-${scenario}-balance`,
      foodBalance(outlook[scenario].balanceTons),
    );
  }
  const floodLossTons = state.storageTons - outlook.flood.storageTons;
  text(
    "forecast-flood-note",
    `${Math.round(floodLossTons) > 0 ? `Flood scenario includes ${tons(floodLossTons)} of opening Storage lost. ` : ""}Purchases and new land preparation take effect next Year.`,
  );
}

// Resolving stays possible, but an ordinary-forecast shortfall is stated on the button.
function renderResolveButton(state: GameState, plan: PlayerPlan): void {
  const balance = foodOutlook(state, plan, CONFIG).ordinary.balanceTons;
  const shortfall = balance < 0;
  el<HTMLButtonElement>("confirm-btn").classList.toggle("warning", shortfall);
  text(
    "confirm-label",
    shortfall ? `Resolve with ${tons(-balance)} shortfall` : "Resolve harvest",
  );
}

interface CommitBarValue {
  label: string;
  value: string;
  alert?: "shortfall" | "overspend" | undefined;
}

/** Fill the mobile pinned bar (shown by CSS below the breakpoint) with two
 * summary values, and mirror the in-page commit button it stands in for:
 * its label, disabled state and shortfall warning. Hidden after Collapse. */
function renderCommitBar(
  sourceId: "confirm-btn" | "allocate-btn",
  values: readonly [CommitBarValue, CommitBarValue],
): void {
  el<HTMLElement>("commit-bar").hidden = save.state.collapsed;
  values.forEach(({ label, value, alert }, i) => {
    text(`commit-bar-label-${i}`, label);
    const valueEl = el<HTMLElement>(`commit-bar-value-${i}`);
    valueEl.textContent = value;
    valueEl.classList.remove("shortfall", "overspend");
    if (alert) valueEl.classList.add(alert);
  });
  const source = el<HTMLButtonElement>(sourceId);
  const button = el<HTMLButtonElement>("commit-bar-btn");
  button.disabled = source.disabled;
  button.classList.toggle("warning", source.classList.contains("warning"));
  text("commit-bar-action", source.textContent?.trim() ?? "");
}

function renderAllocation(): void {
  const pending = save.pendingTurn;
  el<HTMLElement>("allocation").hidden = !pending;
  el<HTMLElement>("production").hidden = !!pending || save.state.collapsed;
  el<HTMLElement>("technologies").hidden = !!pending || save.state.collapsed;
  if (!pending) return;
  const { report } = pending.result;
  el<HTMLElement>("allocation-year").textContent = String(report.year);
  const headline = outcomeHeadline(report);
  text("allocation-outcome-lead", headline.lead);
  text("allocation-famine", headline.context);
  el<HTMLElement>("event-reveal").classList.toggle("famine", headline.famine);
  el<HTMLElement>("allocation-event").textContent = eventSummary(report);
  const eventIcons = {
    none: "sun",
    drought: "sun",
    flood: "rain",
    priceShock: "trade",
  };
  el<SVGUseElement>("allocation-event-icon").setAttribute(
    "href",
    `#icon-${eventIcons[report.event]}`,
  );
  text("allocation-population-change", populationChange(report));
  el<HTMLElement>("allocation-harvest").textContent = tons(report.harvestTons);
  el<HTMLElement>("allocation-consumption").textContent = tons(
    report.consumptionTons,
  );
  el<HTMLElement>("allocation-surplus").textContent = tons(
    Math.max(0, report.availableFoodTons - report.consumptionTons),
  );
  el<HTMLElement>("allocation-price").textContent = coinRate(
    report.exportPriceCoins,
    "t",
    2,
  );
  const input = el<HTMLInputElement>("plan-store");
  input.min = String(pending.minStoreTons);
  input.max = String(pending.maxStoreTons);
  input.value = String(pending.minStoreTons);
  input.disabled = pending.minStoreTons === pending.maxStoreTons;
  const slider = el<HTMLInputElement>("plan-store-slider");
  slider.min = input.min;
  slider.max = input.max;
  slider.value = input.value;
  slider.disabled = input.disabled;
  for (const [id, storeTons] of [
    ["store-min", pending.minStoreTons],
    ["store-max", pending.maxStoreTons],
  ] as const) {
    el<HTMLButtonElement>(`${id}-btn`).disabled =
      input.disabled || persistenceBlocked();
    const outcome = finishTurn(pending, storeTons, CONFIG).state;
    text(
      `${id}-outcome`,
      `${exactTons(storeTons)} kept · next Budget ${coins(outcome.budgetCoins)}`,
    );
  }
  text("plan-upkeep-price", coinRate(pending.storageUpkeepPerTon, "t"));
  el<HTMLElement>("plan-store-range").textContent =
    `${exactTons(pending.minStoreTons)}–${exactTons(pending.maxStoreTons)} affordable range`;
  text(
    "allocation-retained",
    pending.minStoreTons > 0
      ? `${exactTons(pending.minStoreTons)} of surviving old food must stay in Storage and cannot be exported.`
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
    renderCommitBar("allocate-btn", [
      { label: "Storage kept", value: "—" },
      { label: "Next-year Budget", value: "—" },
    ]);
    return;
  }
  const { report, state } = finishTurn(pending, value, CONFIG);
  text("allocation-stored", exactTons(value));
  text("allocation-exported", tons(report.exportTons));
  text("allocation-income", coins(report.exportIncomeCoins));
  text("allocation-upkeep", coins(report.storageUpkeepCoins));
  text("allocation-next-budget", coins(state.budgetCoins));
  el<HTMLElement>("allocation-preview").textContent =
    `Upkeep ${coins(report.storageUpkeepCoins)} · total spending ${coins(report.budgetSpentCoins)} · carry-over ${coins(report.budgetCarryOverCoins)} · export ${tons(report.exportTons)} for ${coins(report.exportIncomeCoins)}`;
  renderCommitBar("allocate-btn", [
    { label: "Storage kept", value: exactTons(value) },
    { label: "Next-year Budget", value: coins(state.budgetCoins) },
  ]);
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
  el<HTMLElement>("report-harvest").textContent = tons(report.harvestTons);
  el<HTMLElement>("report-consumption").textContent = tons(
    report.consumptionTons,
  );
  el<HTMLElement>("report-available").textContent = tons(
    report.availableFoodTons,
  );

  const headline = outcomeHeadline(report);
  text("report-outcome-lead", headline.lead);
  text("report-famine", headline.context);

  const milestoneLevel = report.milestoneLevel;
  const milestoneEl = el<HTMLElement>("milestone-banner");
  if (milestoneLevel !== null) {
    const threshold = CONFIG.startingPopulation * 2 ** milestoneLevel;
    milestoneEl.textContent = `Milestone — population reached ×${2 ** milestoneLevel} of the starting value: ${fmt(threshold)} people`;
    milestoneEl.hidden = false;
  } else {
    milestoneEl.hidden = true;
  }

  text("report-population-summary", populationChange(report));
  text("report-peak", fmt(state.highestPopulation));
  text("report-storage-summary", tons(state.storageTons));
  text("report-budget-summary", coins(state.budgetCoins));
  el<HTMLElement>("report-pop-change").textContent = populationChange(report);

  el<HTMLElement>("report-seeds").textContent =
    `-${coins(report.seedCostCoins)}`;
  el<HTMLElement>("report-fertilizer").textContent =
    `-${coins(report.fertilizerCostCoins)}`;
  el<HTMLElement>("report-prep").textContent =
    `-${coins(report.landPrepCostCoins)}`;
  el<HTMLElement>("report-upkeep").textContent =
    `-${coins(report.storageUpkeepCoins)}`;
  el<HTMLElement>("report-technologies").textContent =
    report.technologiesPurchased.length > 0
      ? `-${coins(report.technologyCostCoins)} (${report.technologiesPurchased.map((id) => TECHNOLOGY_NAMES[id]).join(", ")})`
      : "—";
  el<HTMLElement>("report-export").textContent =
    `${tons(report.exportTons)} for +${coins(report.exportIncomeCoins)}`;
  el<HTMLElement>("report-carryover").textContent = coins(
    report.budgetCarryOverCoins,
  );
  el<HTMLElement>("report-tax").textContent =
    `+${coins(report.budgetRevenueCoins)}`;
  el<HTMLElement>("report-new-budget").textContent = coins(state.budgetCoins);
}

function renderCollapse(state: GameState): void {
  const section = el<HTMLElement>("collapse-summary");
  if (!state.collapsed) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const summary = collapseSummary(save, CONFIG.startingPopulation);
  text("collapse-cause", summary.cause);
  text("collapse-event", summary.event);
  el<HTMLElement>("collapse-event").hidden = summary.event === "";
  text("collapse-length", summary.runLength);
  text("collapse-score", summary.score);
}

function render(): void {
  const latest = save.eventLog.at(-1)?.result;
  if (latest) renderReport(latest);
  else el<HTMLElement>("report").hidden = true;
  renderStats();
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
    ? `Plan preview: ${fmt(cultivated ?? 0)} of ${fmt(state.arableLandHectares)} ha cultivated (${Math.round(fraction * 100)}%).${preview.preparedHectares > 0 ? ` ${hectares(preview.preparedHectares)} of new land available next Year.` : ""}`
    : cultivated === undefined
      ? year === undefined
        ? "No harvest resolved yet."
        : `Year ${year}: cultivation was not recorded in this legacy save.`
      : `${save.pendingTurn ? "This Year" : `Year ${year}`}: ${fmt(cultivated)} of ${fmt(state.arableLandHectares)} ha cultivated (${Math.round(fraction * 100)}%). Latest harvest.`;
  const village =
    villageHouses(population, state.highestPopulation).faded > 0
      ? `${caption} Faded houses show Population lost since its peak.`
      : caption;
  el<HTMLElement>("country-caption").textContent = village;
  el<SVGElement>("country-svg").setAttribute("aria-label", village);
  text(
    "land-cultivated",
    cultivated === undefined ? "Unknown" : hectares(cultivated),
  );
  text("land-prepared", hectares(state.preparedLandHectares));
  text(
    "land-unprepared",
    hectares(state.arableLandHectares - state.preparedLandHectares),
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
  // Milestone progress is a planning aid; the Collapse summary carries the Score.
  el<HTMLElement>("milestone-meter").hidden = state.collapsed;
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
  const landmarks = el<HTMLElement>("country-technologies");
  landmarks.hidden = state.ownedTechnologies.length === 0;
  landmarks.textContent = `In your landscape: ${state.ownedTechnologies.map((id) => TECHNOLOGY_NAMES[id]).join(", ")}`;
}

function renderEventLog(): void {
  const table = el<HTMLTableElement>("event-log");
  const body = table.tBodies[0];
  if (!body) return;
  const rows = chronicleRows(save.eventLog);
  body.textContent = "";
  table.hidden = rows.length === 0;
  // A committed Harvest awaiting allocation has already begun the story.
  el<HTMLElement>("empty-history").hidden =
    rows.length > 0 || save.pendingTurn !== undefined;
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.classList.add(row.eventType);
    if (row.famine) tr.classList.add("famine");
    const year = document.createElement("th");
    year.scope = "row";
    year.textContent = row.year;
    tr.appendChild(year);
    const cells: [string, string][] = [
      ["event-cell", row.event],
      ["harvest-cell", row.harvest],
      ["population-cell", row.population],
      ["budget-cell", row.budget],
    ];
    for (const [className, value] of cells) {
      const cell = document.createElement("td");
      cell.className = className;
      cell.textContent = value;
      if (value === UNKNOWN) cell.classList.add("unknown");
      tr.appendChild(cell);
    }
    if (row.famine) {
      const tag = document.createElement("span");
      tag.className = "famine-tag";
      tag.textContent = row.famine;
      tr.querySelector(".population-cell")?.appendChild(tag);
    }
    body.appendChild(tr);
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

// The button that opened the Restart dialog; focus returns there when it closes.
let restartOpener: HTMLButtonElement | undefined;

function restart(event: MouseEvent): void {
  if (persistenceBlocked()) return;
  restartOpener = event.currentTarget as HTMLButtonElement;
  text("restart-warning", restartWarning(save));
  const dialog = el<HTMLDialogElement>("restart-dialog");
  dialog.returnValue = "";
  dialog.showModal();
  // Keeping the run is the safe default.
  el<HTMLButtonElement>("restart-cancel-btn").focus();
}

// Escape and "Keep playing" leave the run, including a pending allocation,
// untouched; only "Restart run" replaces it.
function closeRestartDialog(): void {
  const opener = restartOpener;
  restartOpener = undefined;
  if (
    el<HTMLDialogElement>("restart-dialog").returnValue === "restart" &&
    !persistenceBlocked()
  ) {
    restartCandidate = newSave();
    retryPersistence();
  }
  if (persistenceBlocked()) el<HTMLButtonElement>("retry-save-btn").focus();
  else if (opener?.checkVisibility() && !opener.disabled) opener.focus();
  else focusPanel("production");
}

// Keep Tab and Shift+Tab cycling between the dialog's two actions.
function trapRestartFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const first = el<HTMLButtonElement>("restart-cancel-btn");
  const last = el<HTMLButtonElement>("restart-confirm-btn");
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
      lastPlanChange = PRODUCTION_INPUTS[id];
      updatePlanPreview(save.state);
    });
    el<HTMLInputElement>(`${id}-slider`).addEventListener("input", () => {
      el<HTMLInputElement>(id).value = el<HTMLInputElement>(
        `${id}-slider`,
      ).value;
      planEdited = true;
      lastPlanChange = PRODUCTION_INPUTS[id];
      updatePlanPreview(save.state);
    });
  }
  for (const techId of TECHNOLOGY_IDS) {
    el<HTMLInputElement>(`tech-${techId}`).addEventListener("change", () => {
      lastPlanChange = techId;
      updatePlanPreview(save.state);
    });
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
    lastPlanChange = "cultivatedHectares";
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("fertilize-all-btn").addEventListener("click", () => {
    el<HTMLInputElement>("plan-fertilizer").value = String(
      readPlanInputs(save.state).cultivatedHectares,
    );
    planEdited = true;
    lastPlanChange = "fertilizedHectares";
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("suggest-plan-btn").addEventListener("click", () => {
    for (const id of ["plan-hectares", "plan-fertilizer"]) {
      el<HTMLInputElement>(id).value = String(save.state.preparedLandHectares);
    }
    planEdited = true;
    // Both production inputs changed; neither one nor a Technology is to blame.
    lastPlanChange = undefined;
    updatePlanPreview(save.state);
  });
  el<HTMLButtonElement>("sound-btn").addEventListener("click", () => {
    sound.setEnabled(!sound.enabled);
    el<HTMLButtonElement>("sound-btn").setAttribute(
      "aria-pressed",
      String(sound.enabled),
    );
    text("sound-state", sound.enabled ? "On" : "Off");
    void sound.play("growth");
  });
  el<HTMLButtonElement>("allocate-btn").addEventListener(
    "click",
    confirmAllocation,
  );
  el<HTMLButtonElement>("confirm-btn").addEventListener("click", confirmPlan);
  el<HTMLButtonElement>("commit-bar-btn").addEventListener("click", () => {
    if (save.pendingTurn) confirmAllocation();
    else confirmPlan();
  });
  // Reserve the pinned bar's height (0 while CSS hides it) so it never covers
  // the end of the page or an input scrolled into view.
  const commitBar = el<HTMLElement>("commit-bar");
  new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      "--commit-bar-height",
      `${Math.ceil(commitBar.getBoundingClientRect().height)}px`,
    );
  }).observe(commitBar);
  el<HTMLButtonElement>("restart-btn").addEventListener("click", restart);
  el<HTMLButtonElement>("collapse-restart-btn").addEventListener(
    "click",
    restart,
  );
  const restartDialog = el<HTMLDialogElement>("restart-dialog");
  restartDialog.addEventListener("close", closeRestartDialog);
  restartDialog.addEventListener("keydown", trapRestartFocus);
  render();
  settleLandscape(el<SVGSVGElement>("country-svg"));
}

init();
