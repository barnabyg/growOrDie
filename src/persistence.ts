// Pure persistence for Grow or Die saves: no DOM access, so the rules run under vitest.
import { CONFIG } from "./config.js";
import { createNewGame } from "./simulation.js";
import type { CollapseCause, EventType, GameState, PendingTurn, PlayerPlan, TechnologyId, YearReport } from "./types.js";

export const SAVE_KEY = "growOrDie.save.v1";
export const SAVE_VERSION = 1;

export interface EventLogEntry {
  year: number;
  event: EventType;
  summary: string;
  cultivatedHectares?: number;
}

export interface SaveData {
  version: number;
  runSeed: number;
  state: GameState;
  // One entry per confirmed Turn (including "none" years); rebuilt into the log on load.
  eventLog: EventLogEntry[];
  pendingTurn?: PendingTurn;
}

// Minimal storage contract so tests can inject a fake and the module stays DOM-free.
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const EVENT_TYPES: readonly EventType[] = ["none", "drought", "flood", "priceShock"];
const TECHNOLOGY_IDS: readonly TechnologyId[] = ["irrigation", "highYieldSeeds", "granary", "tradeRoutes", "landSurvey", "fertilizerWorks"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEventEntry(value: unknown): value is EventLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return isFiniteNumber(entry.year) && EVENT_TYPES.includes(entry.event as EventType) && typeof entry.summary === "string" && (entry.cultivatedHectares === undefined || (isFiniteNumber(entry.cultivatedHectares) && entry.cultivatedHectares >= 0));
}

function isTechnologyId(value: unknown): value is TechnologyId {
  return TECHNOLOGY_IDS.includes(value as TechnologyId);
}

// The v1 format stays a compatibility contract: saves written before the event log,
// Technologies, or Score existed must still load. Missing fields get their legacy
// defaults; present-but-wrong-shaped fields are corruption and reject the whole save.
function parseState(value: unknown): GameState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const year = raw.year;
  const population = raw.population;
  const arableLandHectares = raw.arableLandHectares;
  const preparedLandHectares = raw.preparedLandHectares;
  const storageTons = raw.storageTons;
  const budgetCoins = raw.budgetCoins;
  const worldPrice = raw.worldPrice;
  // Fields that drive the simulation must be exact finite numbers, or the run would
  // play back wrong (NaN propagation); a corrupted value means a fresh start instead.
  if (
    !isFiniteNumber(year) ||
    !isFiniteNumber(population) ||
    !isFiniteNumber(arableLandHectares) ||
    !isFiniteNumber(preparedLandHectares) ||
    !isFiniteNumber(storageTons) ||
    !isFiniteNumber(budgetCoins) ||
    !isFiniteNumber(worldPrice)
  ) {
    return null;
  }

  // Validate relationships, not today's tunable balance limits. Negative Budget
  // is readable legacy debt; rejecting it would discard runs written by v1.
  if (
    !Number.isSafeInteger(year) || year < 1 || population < 0 ||
    arableLandHectares < 0 || preparedLandHectares < 0 ||
    preparedLandHectares > arableLandHectares || storageTons < 0 || worldPrice < 0
  ) return null;

  let ownedTechnologies: TechnologyId[];
  if (raw.ownedTechnologies === undefined) {
    // Tolerant of saves written before Technologies existed.
    ownedTechnologies = [];
  } else if (!Array.isArray(raw.ownedTechnologies) || !raw.ownedTechnologies.every(isTechnologyId)) {
    return null;
  } else {
    ownedTechnologies = [...new Set(raw.ownedTechnologies)];
  }

  // Old saves may predate Score/Collapse. Recover at least the known population
  // peak, and derive Collapse from population rather than trusting stale flags.
  const highestPopulation = Math.max(CONFIG.startingPopulation, population,
    isFiniteNumber(raw.highestPopulation) ? raw.highestPopulation : 0);
  const collapseCause: CollapseCause | null =
    population === 0 ? "totalFamine" : population < CONFIG.startingPopulation / 2 ? "belowHalf" : null;

  return {
    year,
    population,
    highestPopulation,
    collapsed: collapseCause !== null,
    collapseCause,
    arableLandHectares,
    preparedLandHectares,
    storageTons,
    budgetCoins,
    worldPrice,
    ownedTechnologies,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isYearReport(value: unknown): value is YearReport {
  const raw = record(value);
  if (!raw) return false;
  const nonnegative = ["year", "harvestTons", "consumptionTons", "availableFoodTons", "populationStart", "populationEnd", "seedCostCoins", "fertilizerCostCoins", "landPrepCostCoins", "storageUpkeepCoins", "technologyCostCoins", "storageDestroyedTons", "exportTons", "exportPriceCoins", "exportIncomeCoins", "budgetSpentCoins", "budgetRevenueCoins", "droughtYieldLossFraction"];
  if (!nonnegative.every(key => isFiniteNumber(raw[key]) && raw[key] >= 0)) return false;
  return Number.isInteger(raw.year) && Number(raw.year) > 0
    && EVENT_TYPES.includes(raw.event as EventType)
    && ["none", "partial", "total"].includes(String(raw.famine))
    && isFiniteNumber(raw.budgetCarryOverCoins)
    && (raw.milestoneLevel === null || (isFiniteNumber(raw.milestoneLevel) && Number.isInteger(raw.milestoneLevel) && raw.milestoneLevel > 0))
    && Array.isArray(raw.technologiesPurchased) && raw.technologiesPurchased.every(isTechnologyId);
}

function parsePending(value: unknown, opening: GameState): PendingTurn | null {
  const raw = record(value);
  const outcome = record(raw?.result);
  const plan = record(raw?.plan);
  if (!raw || !outcome || !plan || !isYearReport(outcome.report)) return null;
  const state = parseState(outcome.state);
  const report = outcome.report;
  if (!state || opening.collapsed || state.year !== opening.year + 1 || report.year !== opening.year || report.populationStart !== opening.population || report.populationEnd !== state.population) return null;
  const planFields = ["cultivatedHectares", "fertilizedHectares", "preparedHectares", "storeTons"];
  if (!planFields.every(key => isFiniteNumber(plan[key]) && plan[key] >= 0)) return null;
  if (Number(plan.cultivatedHectares) > opening.preparedLandHectares || Number(plan.fertilizedHectares) > Number(plan.cultivatedHectares) || Number(plan.preparedHectares) > opening.arableLandHectares - opening.preparedLandHectares || plan.storeTons !== 0) return null;
  if (plan.purchaseTechnologies !== undefined && (!Array.isArray(plan.purchaseTechnologies) || !plan.purchaseTechnologies.every(isTechnologyId))) return null;
  const min = raw.minStoreTons;
  const max = raw.maxStoreTons;
  const surplus = Math.max(0, report.availableFoodTons - report.consumptionTons);
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || min < 0 || max < min || max > surplus + 1e-8 || state.storageTons !== min) return null;
  const close = (left: number, right: number): boolean => Math.abs(left - right) < 1e-6;
  if (!close(min + report.exportTons, surplus) || !close(report.exportIncomeCoins, report.exportTons * report.exportPriceCoins) || !close(state.budgetCoins, report.budgetCarryOverCoins + report.budgetRevenueCoins)) return null;
  const costs = report.seedCostCoins + report.fertilizerCostCoins + report.landPrepCostCoins + report.storageUpkeepCoins + report.technologyCostCoins;
  const expectedMinimum = Math.max(0, opening.storageTons - report.storageDestroyedTons - report.consumptionTons);
  const rate = raw.storageUpkeepPerTon;
  if (!isFiniteNumber(rate) || rate < 0) return null;
  const expectedMaximum = rate > 0 ? Math.min(surplus, min + Math.max(0, report.budgetCarryOverCoins) / rate) : surplus;
  if (!close(min, expectedMinimum) || !close(max, expectedMaximum) || !close(report.storageUpkeepCoins, min * rate)) return null;
  if (state.arableLandHectares !== opening.arableLandHectares || state.preparedLandHectares !== opening.preparedLandHectares + Math.floor(Number(plan.preparedHectares))) return null;
  if (!close(costs, report.budgetSpentCoins) || !close(opening.budgetCoins - costs, report.budgetCarryOverCoins)) return null;
  const purchased = [...new Set((plan.purchaseTechnologies as TechnologyId[] | undefined ?? []).filter(id => !opening.ownedTechnologies.includes(id)))];
  const expectedOwned = [...opening.ownedTechnologies, ...purchased];
  if (JSON.stringify(purchased) !== JSON.stringify(report.technologiesPurchased) || JSON.stringify(expectedOwned) !== JSON.stringify(state.ownedTechnologies)) return null;
  return { plan: plan as unknown as PlayerPlan, result: { state, report }, storageUpkeepPerTon: rate, minStoreTons: min, maxStoreTons: max };
}

export function parseSave(raw: string | null): SaveData | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== SAVE_VERSION) return null;
  const runSeed = candidate.runSeed;
  if (!isFiniteNumber(runSeed)) return null;
  const state = parseState(candidate.state);
  if (state === null) return null;

  let eventLog: EventLogEntry[];
  if (candidate.eventLog === undefined) {
    // Tolerant of saves written before the event log existed.
    eventLog = [];
  } else if (!Array.isArray(candidate.eventLog)) {
    return null;
  } else {
    // The log is display-only: drop malformed entries instead of rejecting the run.
    eventLog = candidate.eventLog.filter(isEventEntry);
  }

  const pendingTurn = candidate.pendingTurn === undefined ? undefined : parsePending(candidate.pendingTurn, state);
  // Never discard a malformed committed outcome and reroll the same year.
  if (pendingTurn === null) return null;
  return { version: SAVE_VERSION, runSeed, state, eventLog, ...(pendingTurn ? { pendingTurn } : {}) };
}

export function loadSave(storage: SaveStorage = localStorage): SaveData | null {
  return parseSave(storage.getItem(SAVE_KEY));
}

export function persist(save: SaveData, storage: SaveStorage = localStorage): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function clearSave(storage: SaveStorage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

// A fresh run at the spec baseline; used on first visit and after an explicit restart.
export function newSave(runSeed: number = (Math.random() * 0x7fffffff) | 0): SaveData {
  return { version: SAVE_VERSION, runSeed, state: createNewGame(CONFIG), eventLog: [] };
}
