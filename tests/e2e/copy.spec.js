import { test, expect } from "@playwright/test";
import { startGameServer } from "../../server.js";

// Player-facing copy: units, plurals, Year terminology and no raw identifiers.

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

async function fixture(page, { runSeed = 5, state = {} } = {}) {
  await page.goto(origin);
  await page.evaluate(
    async ({ runSeed, state }) => {
      const { newSave, persist } = await import("/dist/persistence.js");
      const save = newSave(runSeed);
      Object.assign(save.state, state);
      persist(save);
    },
    { runSeed, state },
  );
  await page.reload();
}

async function plan(page, hectares, fertilizer) {
  await page.locator("#plan-hectares").fill(String(hectares));
  await page.locator("#plan-fertilizer").fill(String(fertilizer));
}

// Rendered text with every disclosure expanded, so hidden details count too.
async function renderedText(page) {
  return page.evaluate(() => {
    for (const details of document.querySelectorAll("details")) {
      details.open = true;
    }
    return document.body.innerText;
  });
}

const RAW_IDENTIFIERS = [
  /\bnone\b/,
  /\bpartial\b/,
  /\btotal\)/,
  /\bpriceShock\b/,
  /\bhighYieldSeeds\b/,
  /\btotalFamine\b/,
  /\bbelowHalf\b/,
  /Famine: (?:none|partial|total)\b/i,
  /Famine \(/,
];
const COPY_PROBLEMS = [
  /\bTurns?\b/,
  /\bturns?\b/,
  /\b1 coins\b/,
  /\d \/t\b/,
  /Opening World price/,
];

async function expectCleanCopy(page, screen) {
  const rendered = await renderedText(page);
  for (const pattern of [...RAW_IDENTIFIERS, ...COPY_PROBLEMS]) {
    expect(rendered, `${screen} shows ${pattern}`).not.toMatch(pattern);
  }
}

test("plan, allocation, report, chronicle and Collapse never show raw identifiers or Turn wording", async ({
  page,
}) => {
  // Seed 3 rolls an export price shock; 300 unfertilized ha cause partial famine.
  await fixture(page, { runSeed: 3 });
  await plan(page, 300, 0);
  await expectCleanCopy(page, "plan");
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-event-title")).toHaveText(
    "An Export price shock",
  );
  await expect(page.locator("#allocation-consumption")).toHaveText(
    "1,000 t needed · Partial famine",
  );
  await expectCleanCopy(page, "allocation");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-famine")).toHaveText("Partial famine");
  await expect(page.locator("#event-log summary")).toContainText(
    "Partial famine",
  );
  await expectCleanCopy(page, "report and chronicle");

  // Zero cultivation in Year 2 starves the shrunken population into Collapse.
  await plan(page, 0, 0);
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(page.locator("#report-famine")).toHaveText("Total famine");
  await expectCleanCopy(page, "Collapse");
});

test("after Collapse the header shows the final Year played and the run length in Years", async ({
  page,
}) => {
  await fixture(page);
  await plan(page, 0, 0);
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#collapse-length")).toHaveText("1 Year");
  await page.reload();
  await expect(page.locator("#stat-year")).toHaveText("1");
});

test("money and rates show their units with correct plurals", async ({
  page,
}) => {
  await fixture(page);
  await plan(page, 400, 400);
  await expect(page.locator("#plan-seed-price")).toHaveText("2 coins/ha");
  await expect(page.locator("#plan-fert-price")).toHaveText("3 coins/ha");
  await expect(page.locator("#plan-prep-price")).toHaveText("60 coins/ha");
  await expect(page.locator("#plan-total-cost")).toHaveText("2,000 coins");
  await expect(page.locator("#plan-seed-cost")).toHaveText("800 coins");
  await expect(page.locator("#plan-upkeep-cost")).toHaveText("0 coins");
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-price")).toHaveText("10.00 coins/t");
  await expect(page.locator("#plan-upkeep-price")).toHaveText("1 coin/t");
  await page.locator("#plan-store").fill("200");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-seeds")).toHaveText("-800 coins");
  await expect(page.locator("#report-carryover")).toHaveText("1,800 coins");
  await expect(page.locator("#report-tax")).toHaveText("+8,200 coins");
  await expect(page.locator("#report-new-budget")).toHaveText("10,000 coins");
});

test("the flood note mentions lost Storage only when some would be lost", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator("#forecast-flood-note")).not.toContainText(
    "Storage lost",
  );
  await expect(page.locator("#forecast-flood-note")).toContainText(
    "take effect next Year",
  );
  await fixture(page, { state: { storageTons: 2000 } });
  await expect(page.locator("#forecast-flood-note")).toContainText(
    "500 t of opening Storage lost",
  );
});
