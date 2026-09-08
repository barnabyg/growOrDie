// Pure persistence for Grow or Die saves: no DOM access, so the rules run under vitest.
import { CONFIG } from "./config.js";
import { createNewGame } from "./simulation.js";
import type { CollapseCause, EventType, GameState, TechnologyId } from "./types.js";

export const SAVE_KEY = "growOrDie.save.v1";
export const SAVE_VERSION = 1;

export interface EventLogEntry {
  year: number;
  event: EventType;
  summary: string;
}

export interface SaveData {
  version: number;
  runSeed: number;
  state: GameState;
  // One entry per confirmed Turn (including "none" years); rebuilt into the log on load.
  eventLog: EventLogEntry[];
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
  return isFiniteNumber(entry.year) && EVENT_TYPES.includes(entry.event as EventType) && typeof entry.summary === "string";
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

  return { version: SAVE_VERSION, runSeed, state, eventLog };
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
