import { test, expect } from "@playwright/test";
import { startGameServer } from "../../server.js";

const SAVE_KEY = "growOrDie.save.v1";
let server;
let origin;

test.beforeAll(async () => {
  server = await startGameServer({
    port: 0,
    modulesDirectory: process.env.TEST_GAME_MODULES,
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  await new Promise((done) => server.close(done));
});

async function loadFixture(page, { runSeed = 5, state = {} } = {}) {
  await page.goto(origin);
  await page.evaluate(
    ({ key, runSeed, state }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          runSeed,
          eventLog: [],
          state: {
            year: 1,
            population: 1000,
            highestPopulation: 1000,
            collapsed: false,
            collapseCause: null,
            arableLandHectares: 2000,
            preparedLandHectares: 400,
            storageTons: 0,
            budgetCoins: 4000,
            worldPrice: 10,
            ownedTechnologies: [],
            ...state,
          },
        }),
      );
    },
    { key: SAVE_KEY, runSeed, state },
  );
  await page.reload();
  await expect(page.locator("#stat-year")).toHaveText("1");
}
async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SAVE_KEY,
  );
}
async function resolveHarvest(page, { hectares = 400, fertilizer = 400 } = {}) {
  await page.locator("#plan-hectares").fill(String(hectares));
  await page.locator("#plan-fertilizer").fill(String(fertilizer));
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
}

test("flood losses, consumption, exports and retained food conserve the opening supply", async ({
  page,
}) => {
  await loadFixture(page, { runSeed: 29, state: { storageTons: 2000 } });
  await resolveHarvest(page);
  await expect(page.locator("#allocation-event")).toContainText(
    "500 t of Storage destroyed",
  );
  await expect(page.locator("#allocation-harvest")).toHaveText("960 t");
  await expect(page.locator("#allocation-surplus")).toHaveText("1,460 t");
  await expect(page.locator("#plan-store")).toHaveAttribute("min", "500");
  await page.locator("#plan-store").fill("499");
  await expect(page.locator("#allocate-btn")).toBeDisabled();
  await page.locator("#plan-store").fill("600");
  await expect(page.locator("#allocation-preview")).toContainText(
    "Upkeep 600 coins",
  );
  await expect(page.locator("#allocation-preview")).toContainText(
    "export 860 t for 8,600 coins",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-available")).toHaveText("2,460 t");
  await expect(page.locator("#report-consumption")).toHaveText("1,000 t");
  await expect(page.locator("#report-export")).toHaveText(
    "860 t for +8,600 coins",
  );
  await expect(page.locator("#report-upkeep")).toHaveText("-600 coins");
  await expect(page.locator("#stat-storage")).toHaveText("600 t");
  await expect(page.locator("#stat-budget")).toHaveText("14,200 coins");
  await page.reload();
  await expect(page.locator("#stat-storage")).toHaveText("600 t");
  await expect(page.locator("#stat-budget")).toHaveText("14,200 coins");
});

test("issue #10 zero-harvest flood retains 500 tons without export income", async ({
  page,
}) => {
  await loadFixture(page, { runSeed: 29, state: { storageTons: 2000 } });
  await resolveHarvest(page, { hectares: 0, fertilizer: 0 });
  await expect(page.locator("#allocation-surplus")).toHaveText("500 t");
  await expect(page.locator("#plan-store")).toHaveAttribute("min", "500");
  await expect(page.locator("#plan-store")).toBeDisabled();
  await expect(page.locator("#plan-store")).toHaveValue("500");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-available")).toHaveText("1,500 t");
  await expect(page.locator("#report-consumption")).toHaveText("1,000 t");
  await expect(page.locator("#report-export")).toHaveText("0 t for +0 coins");
  await expect(page.locator("#report-upkeep")).toHaveText("-500 coins");
  await expect(page.locator("#stat-storage")).toHaveText("500 t");
  await expect(page.locator("#stat-budget")).toHaveText("7,700 coins");
  await page.reload();
  await expect(page.locator("#stat-storage")).toHaveText("500 t");
  await expect(page.locator("#stat-budget")).toHaveText("7,700 coins");
});

test("granary discounts the selected retention and charges exactly the preview", async ({
  page,
}) => {
  await loadFixture(page, {
    state: { budgetCoins: 2300, ownedTechnologies: ["granary"] },
  });
  await resolveHarvest(page);
  await expect(page.locator("#plan-store")).toHaveAttribute("max", "600");
  await page.locator("#store-max-btn").click();
  await expect(page.locator("#allocation-preview")).toContainText(
    "Upkeep 300 coins",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-upkeep")).toHaveText("-300 coins");
  await expect(page.locator("#report-carryover")).toHaveText("0 coins");
  await expect(page.locator("#stat-storage")).toHaveText("600 t");
});

test("a purchased technology is saved once and changes the following harvest", async ({
  page,
}) => {
  await loadFixture(page, { runSeed: 5, state: { budgetCoins: 6000 } });
  await page.locator("#tech-highYieldSeeds").check();
  await resolveHarvest(page);
  await expect(page.locator("#allocation-harvest")).toHaveText("1,600 t");
  await page.reload();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-technologies")).toContainText(
    "-3,000 coins",
  );
  await page.reload();
  await expect(page.locator("#tech-highYieldSeeds-status")).toHaveText("Owned");
  await expect(page.locator("#tech-highYieldSeeds")).toBeDisabled();
  await resolveHarvest(page);
  await expect(page.locator("#allocation-event")).toHaveText("No event");
  await expect(page.locator("#allocation-harvest")).toHaveText("2,400 t");
});

for (const [event, runSeed, color] of [
  ["drought", 4, "rgb(169, 113, 66)"],
  ["flood", 43, "rgb(91, 142, 196)"],
]) {
  test(`${event} tint follows the latest harvest through reload and clears on the next ordinary harvest`, async ({
    page,
  }) => {
    await loadFixture(page, { runSeed });
    await resolveHarvest(page);
    await expect(page.locator("#country-green")).toHaveCSS("fill", color);
    await page.reload();
    await expect(page.locator("#country-green")).toHaveCSS("fill", color);
    await page.locator("#allocate-btn").click();
    await page.reload();
    await expect(page.locator("#country-green")).toHaveCSS("fill", color);
    await expect(page.locator("#country-svg")).toHaveAttribute(
      "aria-label",
      "Year 1: 400 of 2,000 ha cultivated (20%). Latest harvest.",
    );
    await resolveHarvest(page);
    await expect(page.locator("#allocation-event")).toHaveText("No event");
    await expect(page.locator("#country-green")).toHaveCSS(
      "fill",
      "rgb(127, 176, 105)",
    );
    await page.reload();
    await expect(page.locator("#country-green")).toHaveCSS(
      "fill",
      "rgb(127, 176, 105)",
    );
    await page.locator("#allocate-btn").click();
    await page.reload();
    await expect(page.locator("#country-green")).toHaveCSS(
      "fill",
      "rgb(127, 176, 105)",
    );
  });
}

test("production, post-harvest allocation and reload preserve one committed outcome", async ({
  page,
}) => {
  await loadFixture(page);
  await expect(page.locator("#allocation")).toBeHidden();
  await resolveHarvest(page);
  await expect(page.locator("#allocation-harvest")).toHaveText("1,600 t");
  await expect(page.locator("#allocation-surplus")).toHaveText("600 t");
  await expect(page.locator("#stat-year")).toHaveText("1");
  const pending = await saved(page);
  await page.reload();
  await expect(page.locator("#allocation")).toBeVisible();
  expect((await saved(page)).pendingTurn).toEqual(pending.pendingTurn);
  await expect(page.locator("#production")).toBeHidden();
  await page.locator("#plan-store").fill("200");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#stat-year")).toHaveText("2");
  await expect(page.locator("#stat-storage")).toHaveText("200 t");
  await expect(page.locator("#report-export")).toHaveText(
    "400 t for +4,000 coins",
  );
  await expect(page.locator("#report-carryover")).toHaveText("1,800 coins");
  const completed = await saved(page);
  expect(completed.pendingTurn).toBeUndefined();
  expect(completed.eventLog).toHaveLength(1);
  await page.reload();
  await expect(page.locator("#stat-year")).toHaveText("2");
  await expect(page.locator("#stat-population")).toHaveText("1,050");
  await expect(page.locator("#stat-storage")).toHaveText("200 t");
  await expect(page.locator("#country-caption")).toContainText(
    "Year 1: 400 of 2,000 ha cultivated (20%)",
  );
  await expect(page.locator("#event-log tbody tr")).toHaveCount(1);
  expect(await saved(page)).toEqual(completed);
  await expect(page.locator("#report-year")).toHaveText("1");
  await expect(page.locator("#report-export")).toHaveText(
    "400 t for +4,000 coins",
  );
  await expect(page.locator("#event-log tbody td").nth(1)).toHaveText(
    "1,600 t",
  );
});

test("the chronicle tables a mixed history newest first, marks Famine and keeps legacy summaries without inventing figures", async ({
  page,
}) => {
  await loadFixture(page);
  await page.evaluate(() => {
    const key = "growOrDie.save.v1";
    const save = JSON.parse(localStorage.getItem(key));
    save.eventLog = [{ year: 0, event: "none", summary: "Legacy summary" }];
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator("#report")).toBeHidden();
  await expect(page.locator("#event-log tbody tr")).toHaveCount(1);
  // A summary-only entry records no plan, so the default plan is not replaced.
  await expect(page.locator("#plan-hectares")).toHaveValue("400");
  await expect(page.locator("#plan-fertilizer")).toHaveValue("0");
  // 300 unfertilized ha grow 600 t against 1,000 t Consumption: partial famine.
  await resolveHarvest(page, { hectares: 300, fertilizer: 0 });
  await page.locator("#allocate-btn").click();
  const first = (await saved(page)).eventLog[1];
  await resolveHarvest(page);
  await page.locator("#allocate-btn").click();
  await page.reload();
  await expect(page.locator("#report-year")).toHaveText("2");
  expect((await saved(page)).eventLog[1]).toEqual(first);

  const table = page.getByRole("table", { name: "Country chronicle" });
  await expect(table.locator("thead th")).toHaveText([
    "Year",
    "Event",
    "Harvest",
    "Population change",
    "Budget",
  ]);
  // Newest Year first; the legacy entry keeps its summary and known Event.
  const rows = table.locator("tbody tr");
  await expect(rows.locator("th")).toHaveText(["2", "1", "0"]);
  const famineYear = rows.nth(1);
  await expect(famineYear.locator("td").nth(1)).toHaveText("600 t");
  await expect(famineYear.locator("td").nth(2)).toContainText(
    /^-[\d,]+ to [\d,]+/,
  );
  await expect(famineYear.locator(".famine-tag")).toHaveText("Partial famine");
  await expect(famineYear).toHaveClass(/famine/);
  await expect(rows.nth(0).locator(".famine-tag")).toHaveCount(0);
  await expect(rows.nth(0).locator("td").nth(1)).toHaveText(/^[\d,]+ t$/);
  await expect(rows.nth(0).locator("td").nth(3)).toHaveText(/^[\d,]+ coins$/);
  await expect(rows.nth(2).locator("td")).toHaveText([
    "Legacy summary",
    "Unknown",
    "Unknown",
    "Unknown",
  ]);

  // The table never widens the page on the narrowest supported screen.
  await page.setViewportSize({ width: 320, height: 800 });
  await table.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("tuned Technology and fertilizer descriptions agree with costs and next-Turn effects", async ({
  page,
}) => {
  await page.route("**/dist/config.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
Object.assign(CONFIG, {
  fertilizerYieldMultiplier: 1.75,
  irrigationDroughtLossMultiplier: 0.2,
  highYieldSeedsYieldMultiplier: 1.3,
  granaryUpkeepMultiplier: 0.7,
  tradeRoutesPriceMultiplier: 1.1,
  landSurveyCostMultiplier: 0.4,
  fertilizerWorksCostMultiplier: 0.6,
  eventNothingProbability: 1, eventDroughtProbability: 0,
  eventFloodProbability: 0, eventPriceShockProbability: 0,
  technologyCosts: { irrigation: 1.5, highYieldSeeds: 2, granary: 3, tradeRoutes: 4, landSurvey: 5, fertilizerWorks: 6 }
});`,
    });
  });
  await loadFixture(page);
  await expect(page.locator("#plan-fert-yield")).toHaveText("1.75");
  const technologies = [
    ["irrigation", "1.5", "80% less Yield lost to drought"],
    ["highYieldSeeds", "2", "30% more food per hectare"],
    ["granary", "3", "30% less Storage upkeep"],
    ["tradeRoutes", "4", "10% more Export income per ton"],
    ["landSurvey", "5", "60% less land preparation cost"],
    ["fertilizerWorks", "6", "40% less fertilizer cost"],
  ];
  for (const [id, cost, benefit] of technologies) {
    const row = page
      .locator(".tech-row")
      .filter({ has: page.locator(`#tech-${id}`) });
    await expect(row.locator(".tech-cost")).toHaveText(`${cost} coins`);
    await expect(row.locator(".tech-benefit")).toHaveText(benefit);
    await page.locator(`#tech-${id}`).check();
  }
  await resolveHarvest(page);
  let pending = (await saved(page)).pendingTurn;
  expect(pending.result.report.technologyCostCoins).toBe(21.5);
  expect(pending.result.report.harvestTons).toBe(1400);
  await page.locator("#plan-store").fill("0");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#plan-fert-price")).toHaveText("1.8 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("24 coins/ha");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("0.7 coins/t");
  await resolveHarvest(page);
  pending = (await saved(page)).pendingTurn;
  expect(pending.result.report.harvestTons).toBe(1820);
  expect(pending.result.report.fertilizerCostCoins).toBeCloseTo(720);
  expect(pending.result.report.exportPriceCoins).toBeCloseTo(
    (await saved(page)).state.worldPrice * 1.1,
  );
  expect(pending.storageUpkeepPerTon).toBe(0.7);
  const droughtLoss = await page.evaluate(async () => {
    const { CONFIG } = await import("/dist/config.js");
    const { resolveTurn } = await import("/dist/simulation.js");
    const save = JSON.parse(localStorage.getItem("growOrDie.save.v1"));
    return resolveTurn(save.state, save.pendingTurn.plan, 1, {
      ...CONFIG,
      eventNothingProbability: 0,
      eventDroughtProbability: 1,
    }).report.droughtYieldLossFraction;
  });
  expect(droughtLoss).toBeCloseTo(0.1);
});

test("reducing cultivation also reduces the displayed fertilizer hectares", async ({
  page,
}) => {
  await loadFixture(page);
  const fertilizer = page.locator("#plan-fertilizer");

  await fertilizer.fill("400");
  await page.locator("#plan-hectares").fill("100");

  await expect(fertilizer).toHaveAttribute("max", "100");
  await expect(fertilizer).toHaveValue("100");
  await expect(page.locator("#plan-fert-cost")).toHaveText("300 coins");

  await page.locator("#confirm-btn").click();
  expect(
    (await saved(page)).pendingTurn.result.report.fertilizerCostCoins,
  ).toBe(300);
});

test("duplicate submissions cannot reroll a harvest or finalize a Turn twice", async ({
  page,
}) => {
  await loadFixture(page);
  await page.locator("#plan-fertilizer").fill("400");
  await page.locator("#confirm-btn").evaluate((button) => {
    button.click();
    button.click();
  });
  const pending = await saved(page);
  expect(pending.state.year).toBe(1);
  expect(pending.pendingTurn.result.report.harvestTons).toBe(1600);
  expect(pending.eventLog).toHaveLength(0);
  await page.locator("#confirm-btn").evaluate((button) => button.click());
  expect(await saved(page)).toEqual(pending);
  await page.locator("#plan-store").fill("200");
  await page.locator("#allocate-btn").evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.locator("#stat-year")).toHaveText("2");
  const completed = await saved(page);
  expect(completed.pendingTurn).toBeUndefined();
  expect(completed.eventLog).toHaveLength(1);
  expect(completed.state.storageTons).toBe(200);
  await page.reload();
  expect(await saved(page)).toEqual(completed);
});

test("Restart during allocation preserves a cancelled harvest and discards it only on confirmation", async ({
  page,
}) => {
  await loadFixture(page);
  await resolveHarvest(page);
  const pending = await saved(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#restart-btn").click();
  expect(await saved(page)).toEqual(pending);
  await page.reload();
  await expect(page.locator("#allocation")).toBeVisible();
  expect(await saved(page)).toEqual(pending);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restart-btn").click();
  await expect(page.locator("#allocation")).toBeHidden();
  await expect(page.locator("#production")).toBeVisible();
  const restarted = await saved(page);
  expect(restarted.pendingTurn).toBeUndefined();
  expect(restarted.state.year).toBe(1);
  expect(restarted.state.population).toBe(1000);
  expect(restarted.eventLog).toHaveLength(0);
  await page.reload();
  await expect(page.locator("#allocation")).toBeHidden();
  expect(await saved(page)).toEqual(restarted);
});

test("storage affordability cannot spend beyond the remaining production budget", async ({
  page,
}) => {
  await loadFixture(page, { state: { budgetCoins: 2200 } });
  await resolveHarvest(page);
  await expect(page.locator("#plan-store")).toHaveAttribute("max", "200");
  await page.locator("#plan-store").fill("201");
  await expect(page.locator("#allocate-btn")).toBeDisabled();
  await page.locator("#plan-store").fill("200");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-carryover")).toHaveText("0 coins");
  await expect(page.locator("#report-upkeep")).toHaveText("-200 coins");
});

test("owned technology discounts and trade bonus agree between preview and charged results", async ({
  page,
}) => {
  await loadFixture(page, {
    state: {
      budgetCoins: 1550,
      ownedTechnologies: [
        "fertilizerWorks",
        "landSurvey",
        "granary",
        "tradeRoutes",
      ],
    },
  });
  await expect(page.locator("#plan-fert-price")).toHaveText("1.5 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("30 coins/ha");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("0.5 coins/t");
  await page.locator("#plan-fertilizer").fill("400");
  await page.locator("#plan-prep").fill("5");
  await expect(page.locator("#plan-fert-cost")).toHaveText("600 coins");
  await expect(page.locator("#plan-prep-cost")).toHaveText("150 coins");
  await expect(page.locator("#plan-total-cost")).toHaveText("1,550 coins");
  await expect(page.locator("#confirm-btn")).toBeEnabled();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-price")).toHaveText("12.00 coins/t");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-fertilizer")).toHaveText("-600 coins");
  await expect(page.locator("#report-prep")).toHaveText("-150 coins");
  await expect(page.locator("#report-export")).toHaveText(
    "600 t for +7,200 coins",
  );
  await expect(page.locator("#report-carryover")).toHaveText("0 coins");
});

test("Land survey enables 100 ha preparation but blocks spending above Budget", async ({
  page,
}) => {
  await loadFixture(page, { state: { ownedTechnologies: ["landSurvey"] } });
  await page.locator("#plan-hectares").fill("0");
  await page.locator("#plan-prep").fill("100");
  await expect(page.locator("#plan-total-cost")).toHaveText("3,000 coins");
  await expect(page.locator("#confirm-btn")).toBeEnabled();
  await page.locator("#plan-prep").fill("134");
  await expect(page.locator("#plan-total-cost")).toHaveText("4,020 coins");
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await page.locator("#plan-prep").fill("100");
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-prep")).toHaveText("-3,000 coins");
  await expect(page.locator("#report-carryover")).toHaveText("1,000 coins");
});

test("purchased economy technologies change rates only in the following year", async ({
  page,
}) => {
  await loadFixture(page, { state: { budgetCoins: 20000 } });
  for (const id of [
    "fertilizerWorks",
    "landSurvey",
    "granary",
    "tradeRoutes",
  ]) {
    await page.locator(`#tech-${id}`).check();
  }
  await expect(page.locator("#plan-fert-price")).toHaveText("3 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("60 coins/ha");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("1 coin/t");
  await resolveHarvest(page);
  await expect(page.locator("#allocation-price")).toHaveText("10.00 coins/t");
  await page.locator("#store-max-btn").click();
  await expect(page.locator("#allocation-preview")).toContainText(
    "Upkeep 600 coins",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-fertilizer")).toHaveText("-1,200 coins");
  await expect(page.locator("#plan-fert-price")).toHaveText("1.5 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("30 coins/ha");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("0.5 coins/t");
  await page.reload();
  await expect(page.locator("#plan-fert-price")).toHaveText("1.5 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("30 coins/ha");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("0.5 coins/t");
  await resolveHarvest(page);
  const price = (await saved(page)).state.worldPrice;
  await expect(page.locator("#allocation-price")).toHaveText(
    `${(price * 1.2).toFixed(2)} coins/t`,
  );
});

for (const fixture of [
  {
    name: "drought",
    runSeed: 0,
    harvest: "1,200 t",
    event: "Drought",
    state: { ownedTechnologies: ["irrigation"] },
  },
  {
    name: "flood",
    runSeed: 29,
    harvest: "960 t",
    event: "Flood",
    state: { storageTons: 2000 },
  },
  {
    name: "price shock",
    runSeed: 3,
    harvest: "1,600 t",
    event: "price",
    state: {},
  },
]) {
  test(`${fixture.name} is shown before allocation and is stable across reload`, async ({
    page,
  }) => {
    await loadFixture(page, fixture);
    await resolveHarvest(page);
    await expect(page.locator("#allocation-harvest")).toHaveText(
      fixture.harvest,
    );
    await expect(page.locator("#allocation-event")).toContainText(
      new RegExp(fixture.event, "i"),
    );
    const committed = (await saved(page)).pendingTurn;
    await page.reload();
    expect((await saved(page)).pendingTurn).toEqual(committed);
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#stat-year")).toHaveText("2");
    const latestReport = await page.locator("#report").innerText();
    await page.reload();
    await expect(page.locator("#report")).toHaveText(latestReport, {
      useInnerText: true,
    });
    await expect(page.locator("#event-log tbody td").last()).toHaveText(
      /^[\d,]+ coins?$/,
    );
    if (fixture.name === "drought") {
      await expect(page.locator("#report-event")).toContainText("25%");
      await expect(page.locator("#country-green")).toHaveClass(/drought/);
    }
    if (fixture.name === "flood") {
      await expect(page.locator("#country-green")).toHaveClass(/flood/);
      const report = committed.result.report;
      const after = await saved(page);
      expect(after.state.storageTons).toBeLessThanOrEqual(
        report.availableFoodTons - report.consumptionTons,
      );
      expect(after.state.budgetCoins).toBeGreaterThanOrEqual(0);
    }
  });
}

test("total famine finishes once, remains collapsed on reload, and restart clears it", async ({
  page,
}) => {
  await loadFixture(page);
  await resolveHarvest(page, { hectares: 0, fertilizer: 0 });
  await expect(page.locator("#allocation-famine")).toHaveText("Total famine");
  await expect(page.locator("#allocation-outcome-lead")).toHaveText(
    "1,000 t shortfall",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(page.locator("#stat-population")).toHaveText("0");
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#report-famine")).toHaveText("Total famine");
  await expect(page.locator("#event-log .famine-tag")).toHaveText(
    "Total famine · Collapse",
  );
  await expect(page.locator("#collapse-summary")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restart-btn").click();
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#collapse-summary")).toBeHidden();
  await expect(page.locator("#confirm-btn")).toBeEnabled();
  expect((await saved(page)).eventLog).toHaveLength(0);
});
