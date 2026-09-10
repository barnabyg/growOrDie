import { CONFIG } from "../dist/config.js";
import { createNewGame } from "../dist/simulation.js";
import { beginTurn, finishTurn, productionCosts } from "../dist/turn.js";

const HORIZON = 40;
const RUN_SEEDS = [0, 3, 4, 29, 43, 100, 250, 999, 2026, 12345];

const policies = {
  reserve: {
    description:
      "Fully fertilize, buy defensive/yield technology, expand 25 ha/year, and retain up to one year's population in Storage.",
    fertilizer: "all",
    prepTarget: 25,
    storageYears: 1,
    technologyOrder: [
      "irrigation",
      "granary",
      "highYieldSeeds",
      "fertilizerWorks",
      "landSurvey",
      "tradeRoutes",
    ],
    priority: "technology",
  },
  reserveNoStorage: {
    description:
      "Use the reserve policy's inputs and Technology order, but export every optional ton to isolate Storage value.",
    fertilizer: "all",
    prepTarget: 25,
    storageYears: 0,
    technologyOrder: [
      "irrigation",
      "granary",
      "highYieldSeeds",
      "fertilizerWorks",
      "landSurvey",
      "tradeRoutes",
    ],
    priority: "technology",
  },
  growth: {
    description:
      "Fully fertilize, expand up to 100 ha/year before investing, buy growth technology, and export every optional ton.",
    fertilizer: "all",
    prepTarget: 100,
    storageYears: 0,
    technologyOrder: [
      "landSurvey",
      "highYieldSeeds",
      "fertilizerWorks",
      "irrigation",
      "tradeRoutes",
      "granary",
    ],
    priority: "land",
  },
  export: {
    description:
      "Fully fertilize, buy yield/trade technology before moderate expansion, and export every optional ton.",
    fertilizer: "all",
    prepTarget: 50,
    storageYears: 0,
    technologyOrder: [
      "highYieldSeeds",
      "fertilizerWorks",
      "tradeRoutes",
      "landSurvey",
      "irrigation",
      "granary",
    ],
    priority: "technology",
  },
  lean: {
    description:
      "Fertilize only enough for 5% growth in an ordinary year, expand 50 ha/year, prefer enabling technology, and retain a quarter-year reserve.",
    fertilizer: "minimum",
    prepTarget: 50,
    storageYears: 0.25,
    technologyOrder: [
      "landSurvey",
      "highYieldSeeds",
      "fertilizerWorks",
      "irrigation",
      "granary",
      "tradeRoutes",
    ],
    priority: "land",
  },
  noTechnology: {
    description:
      "Fully fertilize, expand up to 50 ha/year, buy no Technology, and export every optional ton.",
    fertilizer: "all",
    prepTarget: 50,
    storageYears: 0,
    technologyOrder: [],
    priority: "land",
  },
};

function isAffordable(state, plan) {
  return productionCosts(state, plan, CONFIG).affordable;
}

function basePlan(state, policy) {
  const cultivatedHectares = state.preparedLandHectares;
  const highYieldMultiplier = state.ownedTechnologies.includes("highYieldSeeds")
    ? CONFIG.highYieldSeedsYieldMultiplier
    : 1;
  const ordinaryUnfertilizedYield =
    cultivatedHectares * CONFIG.baseYieldPerHectare * highYieldMultiplier;
  const yieldAddedPerFertilizedHectare =
    CONFIG.baseYieldPerHectare *
    (CONFIG.fertilizerYieldMultiplier - 1) *
    highYieldMultiplier;
  const targetYield = state.population * (1 + CONFIG.populationGrowthRate);
  const minimumFertilizer = Math.max(
    0,
    Math.ceil(
      (targetYield - ordinaryUnfertilizedYield) /
        yieldAddedPerFertilizedHectare,
    ),
  );
  return {
    cultivatedHectares,
    fertilizedHectares:
      policy.fertilizer === "all"
        ? cultivatedHectares
        : Math.min(cultivatedHectares, minimumFertilizer),
    preparedHectares: 0,
    storeTons: 0,
    purchaseTechnologies: [],
  };
}

function nextTechnology(state, policy) {
  return policy.technologyOrder.find(
    (technology) => !state.ownedTechnologies.includes(technology),
  );
}

function maximizePreparation(state, plan, target) {
  const available = state.arableLandHectares - state.preparedLandHectares;
  for (let hectares = Math.min(target, available); hectares >= 0; hectares--) {
    const candidate = { ...plan, preparedHectares: hectares };
    if (isAffordable(state, candidate)) return candidate;
  }
  return plan;
}

function choosePlan(state, policy) {
  let plan = basePlan(state, policy);
  if (!isAffordable(state, plan)) {
    while (plan.fertilizedHectares > 0 && !isAffordable(state, plan)) {
      plan.fertilizedHectares--;
    }
  }

  const technology = nextTechnology(state, policy);
  if (policy.priority === "land") {
    plan = maximizePreparation(state, plan, policy.prepTarget);
  }
  if (technology) {
    const candidate = { ...plan, purchaseTechnologies: [technology] };
    if (isAffordable(state, candidate)) plan = candidate;
  }
  if (policy.priority === "technology") {
    plan = maximizePreparation(state, plan, policy.prepTarget);
  }
  return plan;
}

function run(seed, name, policy) {
  let state = createNewGame(CONFIG);
  let storageUpkeepCoins = 0;
  let eventCount = 0;
  let absorbedEventCount = 0;
  let recoveredEventCount = 0;
  const recoveryChecks = [];
  const milestoneYears = [];
  const technologyYears = {};
  const opening = [];

  while (!state.collapsed && state.year <= HORIZON) {
    const plan = choosePlan(state, policy);
    const pending = beginTurn(state, plan, (seed + state.year) >>> 0, CONFIG);
    const targetStorage = pending.result.state.population * policy.storageYears;
    const storage = Math.max(
      pending.minStoreTons,
      Math.min(pending.maxStoreTons, targetStorage),
    );
    const { state: next, report } = finishTurn(pending, storage, CONFIG);

    if (state.year <= 3) {
      opening.push({
        year: state.year,
        cultivate: plan.cultivatedHectares,
        fertilize: plan.fertilizedHectares,
        prepare: plan.preparedHectares,
        technology: plan.purchaseTechnologies[0] ?? "none",
        store: Math.round(storage),
      });
    }
    for (const technology of report.technologiesPurchased) {
      technologyYears[technology] = state.year;
    }
    if (report.milestoneLevel !== null) milestoneYears.push(state.year);
    storageUpkeepCoins += report.storageUpkeepCoins;
    for (const check of recoveryChecks) {
      if (
        !check.recovered &&
        state.year <= check.deadline &&
        next.population >= check.populationBefore
      ) {
        check.recovered = true;
        recoveredEventCount++;
      }
    }
    if (report.event === "drought" || report.event === "flood") {
      eventCount++;
      if (report.populationEnd >= report.populationStart) {
        absorbedEventCount++;
      } else {
        recoveryChecks.push({
          deadline: state.year + 5,
          populationBefore: report.populationStart,
          recovered: false,
        });
      }
    }
    state = next;
  }

  return {
    policy: name,
    seed,
    survivedYears: Math.min(HORIZON, state.year - 1),
    collapsed: state.collapsed,
    failureCause: state.collapseCause ?? "horizon",
    peakPopulation: state.highestPopulation,
    finalPopulation: state.population,
    finalBudgetCoins: Math.round(state.budgetCoins),
    finalStorageTons: Math.round(state.storageTons),
    firstMilestoneYear: milestoneYears[0] ?? null,
    badEvents: eventCount,
    badEventsAbsorbed: absorbedEventCount,
    recoveredWithinFiveYears: recoveredEventCount,
    storageUpkeepCoins: Math.round(storageUpkeepCoins),
    technologyYears,
    opening,
  };
}

const results = [];
for (const [name, policy] of Object.entries(policies)) {
  for (const seed of RUN_SEEDS) results.push(run(seed, name, policy));
}

const summary = Object.keys(policies).map((policy) => {
  const runs = results.filter((result) => result.policy === policy);
  return {
    policy,
    description: policies[policy].description,
    survivedHorizon: runs.filter((run) => !run.collapsed).length,
    medianSurvivalYears: runs
      .map((run) => run.survivedYears)
      .sort((left, right) => left - right)[Math.floor(runs.length / 2)],
    meanPeakPopulation: Math.round(
      runs.reduce((sum, run) => sum + run.peakPopulation, 0) / runs.length,
    ),
    meanFinalBudgetCoins: Math.round(
      runs.reduce((sum, run) => sum + run.finalBudgetCoins, 0) / runs.length,
    ),
    milestoneRuns: runs.filter((run) => run.firstMilestoneYear !== null).length,
    meanFirstMilestoneYear:
      Math.round(
        (runs
          .filter((run) => run.firstMilestoneYear !== null)
          .reduce((sum, run) => sum + run.firstMilestoneYear, 0) /
          Math.max(
            1,
            runs.filter((run) => run.firstMilestoneYear !== null).length,
          )) *
          10,
      ) / 10,
    badEventOutcomes: `${runs.reduce((sum, run) => sum + run.badEventsAbsorbed, 0)} absorbed + ${runs.reduce((sum, run) => sum + run.recoveredWithinFiveYears, 0)} recovered within five years / ${runs.reduce((sum, run) => sum + run.badEvents, 0)} total`,
    meanStorageUpkeepCoins: Math.round(
      runs.reduce((sum, run) => sum + run.storageUpkeepCoins, 0) / runs.length,
    ),
  };
});

console.log(
  JSON.stringify(
    {
      horizon: HORIZON,
      seeds: RUN_SEEDS,
      summary,
      results,
    },
    null,
    2,
  ),
);
