import { test, expect } from "@playwright/test";
import { startGameServer } from "../../server.js";

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

const stored = (page) =>
  page.evaluate(() => localStorage.getItem("growOrDie.save.v1"));

test("a live forecast makes the initial shortfall visible and previews do not alter the save", async ({
  page,
}) => {
  await fixture(page);
  const before = await stored(page);
  await expect(page.locator("#forecast-available")).toHaveText("800 t");
  await expect(page.locator("#forecast-balance")).toHaveText(
    "200 t shortfall before Events",
  );
  await page.locator("#suggest-plan-btn").click();
  await expect(page.locator("#plan-fertilizer-slider")).toHaveValue("400");
  await expect(page.locator("#forecast-available")).toHaveText("1,600 t");
  await expect(page.locator("#forecast-balance")).toHaveText(
    "600 t Surplus before Events",
  );
  await page.getByText("Weather scenarios", { exact: true }).click();
  await expect(page.locator("#forecast-drought-balance")).toHaveText(
    "200 t shortfall",
  );
  await expect(page.locator("#forecast-flood-harvest")).toHaveText("960 t");
  await page.locator("#plan-hectares-slider").press("Home");
  await expect(page.locator("#plan-hectares")).toHaveValue("0");
  await expect(page.locator("#plan-fertilizer")).toHaveValue("0");
  await expect(page.locator("#plan-fertilizer-slider")).toHaveAttribute(
    "max",
    "0",
  );
  await expect(page.locator("#land-cultivated")).toHaveText("0 ha");
  await page.locator("#plan-hectares").fill("125");
  await expect(page.locator("#plan-hectares-slider")).toHaveValue("125");
  await expect(page.locator("#country-caption")).toContainText(
    "plan preview: 125",
  );
  await page.locator("#plan-prep").fill("100");
  await expect(page.locator("#plan-error")).toBeVisible();
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await expect(page.locator("#country-caption")).toContainText(
    "100 new ha available next Turn",
  );
  expect(await stored(page)).toBe(before);
});

const barBox = async (page, id) =>
  page.locator(`#${id}`).evaluate((node) => {
    const { x, width } = node.getBoundingClientRect();
    return { x, width };
  });

test("the food forecast is one labelled bar with a Consumption marker and a visible drought outcome", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // settle bar widths
  await fixture(page);
  const meter = page.locator("#forecast-food-meter");
  await expect(page.getByText("Green: Harvest")).toHaveCount(0);
  await expect(page.locator("#forecast-consumption-meter")).toHaveCount(0);
  await expect(meter).toHaveAccessibleDescription(
    "Available food 800 tons (Harvest 800 tons plus opening Storage 0 tons) against Consumption 1,000 tons: 200 tons shortfall before Events.",
  );
  await expect(page.locator("#forecast-harvest")).toHaveText("800 t");
  await expect(page.locator("#forecast-storage")).toHaveText("0 t");
  await expect(page.locator("#forecast-consumption")).toHaveText("1,000 t");
  await expect(page.locator("#forecast-drought-outcome")).toBeVisible();
  await expect(page.locator("#forecast-drought-outcome")).toHaveText(
    "Drought: 400 t Harvest · 600 t shortfall",
  );
  const bar = await barBox(page, "forecast-food-meter");
  const shortfall = await barBox(page, "forecast-shortfall-bar");
  expect(shortfall.width / bar.width).toBeCloseTo(0.2, 1);
  const marker = await barBox(page, "forecast-consumption-marker");
  expect(marker.x + marker.width / 2).toBeCloseTo(bar.x + bar.width, 0);

  await fixture(page, { state: { storageTons: 400 } });
  await page.locator("#suggest-plan-btn").click();
  await expect(meter).toHaveAccessibleDescription(
    "Available food 2,000 tons (Harvest 1,600 tons plus opening Storage 400 tons) against Consumption 1,000 tons: 1,000 tons Surplus before Events.",
  );
  await expect(page.locator("#forecast-drought-outcome")).toHaveText(
    "Drought: 800 t Harvest · 200 t Surplus",
  );
  await expect(
    page.locator("details:has(.scenario-table)"),
  ).not.toHaveAttribute("open");
  const surplusBar = await barBox(page, "forecast-food-meter");
  const storage = await barBox(page, "forecast-storage-bar");
  expect(storage.width / surplusBar.width).toBeCloseTo(0.2, 1);
  expect((await barBox(page, "forecast-shortfall-bar")).width).toBe(0);
  const surplusMarker = await barBox(page, "forecast-consumption-marker");
  expect(surplusMarker.x + surplusMarker.width / 2).toBeCloseTo(
    surplusBar.x + surplusBar.width / 2,
    0,
  );
});

for (const colorScheme of ["light", "dark"]) {
  test(`food bar segments and the Consumption marker meet 3:1 contrast in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await fixture(page);
    const ratios = await page.evaluate(() => {
      const rgb = (id, property = "background-color") =>
        getComputedStyle(document.querySelector(id))
          .getPropertyValue(property)
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const luminance = (channels) => {
        const [r, g, b] = channels.map((value) => {
          const c = value / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a, b) => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
      };
      const surround = rgb(".food-outlook");
      return Object.fromEntries(
        [
          "#forecast-harvest-bar",
          "#forecast-storage-bar",
          "#forecast-shortfall-bar",
          "#forecast-consumption-marker",
        ].map((id) => [id, contrast(rgb(id), surround)]),
      );
    });
    for (const ratio of Object.values(ratios)) {
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
}

test("the allocation slider preserves retained-food bounds and agrees with saved accounting", async ({
  page,
}) => {
  await fixture(page, { runSeed: 29, state: { storageTons: 2000 } });
  await page.locator("#suggest-plan-btn").click();
  await expect(page.locator("#forecast-flood-balance")).toHaveText(
    "1,460 t Surplus",
  );
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-event-title")).toHaveText("Flood");
  await expect(page.locator("#budget-label")).toHaveText("Opening Budget");
  await expect(page.locator("#step-allocate")).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.locator("#allocation-title")).toBeFocused();
  await expect(page.locator("#allocation-retained")).toContainText(
    "500 t of surviving old food must stay",
  );
  await expect(page.locator("#plan-store-slider")).toHaveAttribute(
    "min",
    "500",
  );
  const pending = await stored(page);
  await page.locator("#plan-store").fill("499");
  await expect(page.locator("#allocation-error")).toBeVisible();
  await expect(page.locator("#allocate-btn")).toBeDisabled();
  await page.locator("#store-min-btn").click();
  await expect(page.locator("#plan-store")).toHaveValue("500");
  await expect(page.locator("#plan-store-slider")).toHaveValue("500");
  await page.locator("#plan-store").fill("600");
  await expect(page.locator("#allocation-exported")).toHaveText("860 t");
  await expect(page.locator("#allocation-income")).toHaveText("8,600 coins");
  await expect(page.locator("#allocation-upkeep")).toHaveText("600 coins");
  await expect(page.locator("#allocation-next-budget")).toHaveText(
    "14,200 coins",
  );
  expect(await stored(page)).toBe(pending);
  await page.reload();
  expect(await stored(page)).toBe(pending);
  await page.locator("#plan-store").fill("600");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-title")).toBeFocused();
  await expect(page.locator("#stat-budget")).toHaveText("14,200 coins");
  await expect(page.locator("#report-storage-summary")).toHaveText("600 t");
  await expect(page.locator("#budget-label")).toHaveText("Budget");
});

test("Technology cards and landmarks respect next-Turn timing", async ({
  page,
}) => {
  await fixture(page, { state: { budgetCoins: 10000 } });
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#tech-highYieldSeeds").check();
  await page.locator("#tech-irrigation").check();
  await expect(page.locator("#tech-highYieldSeeds-status")).toContainText(
    "Selected",
  );
  await expect(page.locator("#forecast-ordinary-harvest")).toHaveText(
    "1,600 t",
  );
  await expect(page.locator("#forecast-drought-harvest")).toHaveText("800 t");
  await expect(page.locator("#landmark-irrigation")).toHaveAttribute(
    "display",
    "none",
  );
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await page.locator("#fertilize-all-btn").click();
  await expect(page.locator("#tech-highYieldSeeds-owned")).toBeVisible();
  await expect(page.locator("#landmark-irrigation")).not.toHaveAttribute(
    "display",
    "none",
  );
  await expect(page.locator("#forecast-ordinary-harvest")).toHaveText(
    "2,400 t",
  );
  await expect(page.locator("#forecast-drought-harvest")).toHaveText("1,800 t");
  await page.reload();
  await expect(page.locator("#country-technologies")).toContainText(
    "High-yield seeds",
  );
  await expect(page.locator("#tech-highYieldSeeds")).toBeDisabled();
});

test("Collapse replaces planning and supports a confirmed restart without losing history on cancellation", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#plan-hectares-slider").press("Home");
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-title")).toBeFocused();
  await expect(page.locator("#production")).toBeHidden();
  await expect(page.locator("#technologies")).toBeHidden();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(page.locator("#step-report")).toHaveAttribute(
    "aria-current",
    "step",
  );
  const collapsed = await stored(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#collapse-restart-btn").click();
  expect(await stored(page)).toBe(collapsed);
  await page.reload();
  await expect(page.locator("#production")).toBeHidden();
  await page.locator("#report-details summary").click();
  await expect(page.locator("#report-famine")).toHaveText("Famine (total)");
  await expect(page.locator("#report-available")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#collapse-restart-btn").click();
  await expect(page.locator("#production")).toBeVisible();
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#event-log li")).toHaveCount(0);
});

test("a doubling celebrates a Milestone and advances the next population goal", async ({
  page,
}) => {
  await fixture(page, {
    state: {
      population: 1950,
      highestPopulation: 1950,
      preparedLandHectares: 2000,
      budgetCoins: 20000,
    },
  });
  await expect(page.locator("#milestone-target")).toHaveText("2,000 people");
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#milestone-banner")).toBeVisible();
  await expect(page.locator("#milestone-banner")).toContainText("×2");
  await expect(page.locator("#stat-score")).toHaveText("2,048");
  await expect(page.locator("#milestone-target")).toHaveText("4,000 people");
  await page.reload();
  await expect(page.locator("#milestone-target")).toHaveText("4,000 people");
});

test("mobile puts decisions before the landscape, respects reduced motion, and tolerates blocked audio", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.addInitScript(() => {
    window.AudioContext = class {
      constructor() {
        throw new Error("Audio blocked");
      }
    };
  });
  await fixture(page);
  const plan = await page.locator("#production").boundingBox();
  const country = await page.locator(".country").boundingBox();
  expect(plan.y).toBeLessThan(country.y);
  await page.locator("#sound-btn").click();
  await expect(page.locator("#sound-btn")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#event-reveal")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#stat-population")).toHaveText("1,050");
  await page.locator("#sound-btn").click();
  await expect(page.locator("#sound-btn")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(errors).toEqual([]);
});
