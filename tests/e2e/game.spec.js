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
  await expect(page.locator("#report-upkeep")).toHaveText("-600");
  await expect(page.locator("#stat-storage")).toHaveText("600 t");
  await expect(page.locator("#stat-budget")).toHaveText("14,200 coins");
  await page.reload();
  await expect(page.locator("#stat-storage")).toHaveText("600 t");
  await expect(page.locator("#stat-budget")).toHaveText("14,200 coins");
});

test("granary discounts the selected retention and charges exactly the preview", async ({
  page,
}) => {
  await loadFixture(page, {
    state: { budgetCoins: 2300, ownedTechnologies: ["granary"] },
  });
  await resolveHarvest(page);
  await expect(page.locator("#plan-store")).toHaveAttribute("max", "600");
  await expect(page.locator("#allocation-preview")).toContainText(
    "Upkeep 300 coins",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-upkeep")).toHaveText("-300");
  await expect(page.locator("#report-carryover")).toHaveText("0");
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
  await expect(page.locator("#tech-highYieldSeeds-owned")).toBeVisible();
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
  await expect(page.locator("#report-carryover")).toHaveText("1,800");
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
  await expect(page.locator("#event-log li")).toHaveCount(1);
  expect(await saved(page)).toEqual(completed);
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
  await expect(page.locator("#report-carryover")).toHaveText("0");
  await expect(page.locator("#report-upkeep")).toHaveText("-200");
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
  await page.locator("#plan-fertilizer").fill("400");
  await page.locator("#plan-prep").fill("5");
  await expect(page.locator("#plan-fert-cost")).toHaveText("600");
  await expect(page.locator("#plan-prep-cost")).toHaveText("150");
  await expect(page.locator("#plan-total-cost")).toHaveText("1,550");
  await expect(page.locator("#confirm-btn")).toBeEnabled();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-price")).toHaveText("12.00 coins/t");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-fertilizer")).toHaveText("-600");
  await expect(page.locator("#report-prep")).toHaveText("-150");
  await expect(page.locator("#report-export")).toHaveText(
    "600 t for +7,200 coins",
  );
  await expect(page.locator("#report-carryover")).toHaveText("0");
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
  await expect(page.locator("#allocation-consumption")).toContainText("total");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(page.locator("#stat-population")).toHaveText("0");
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await page.reload();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#restart-btn").click();
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#collapse-summary")).toBeHidden();
  await expect(page.locator("#confirm-btn")).toBeEnabled();
  expect((await saved(page)).eventLog).toHaveLength(0);
});
