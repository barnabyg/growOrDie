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
    "Plan preview: 125",
  );
  await page.locator("#plan-prep").fill("100");
  await expect(page.locator("#plan-error")).toBeVisible();
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await expect(page.locator("#country-caption")).toContainText(
    "100 ha of new land available next Year",
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

test("production inputs show the affordable maximum and an inline overspend message", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#suggest-plan-btn").click();
  await expect(page.locator("#plan-hectares-affordable")).toHaveText(
    "Up to 400 ha affordable",
  );
  await expect(page.locator("#plan-fertilizer-affordable")).toHaveText(
    "Up to 400 ha affordable",
  );
  await expect(page.locator("#plan-prep-affordable")).toHaveText(
    "Up to 33 ha affordable",
  );
  const prepSlider = page.locator("#plan-prep-slider");
  const affordableShare = (id) =>
    page
      .locator(`#${id}-range`)
      .evaluate((node) => node.style.getPropertyValue("--affordable"));
  expect(Number(await affordableShare("plan-prep"))).toBeCloseTo(33 / 1600, 5);
  expect(Number(await affordableShare("plan-hectares"))).toBe(1);
  await expect(page.locator("#plan-prep-error")).toBeHidden();

  await page.locator("#plan-prep").fill("100");
  const inline = page.locator("#plan-prep-error");
  await expect(inline).toBeVisible();
  await expect(inline).toHaveText(
    "Over Budget: at most 33 ha is affordable with the rest of this plan.",
  );
  await expect(page.locator("#plan-prep-affordable")).toHaveText(
    "Up to 33 ha affordable",
  );
  await expect(page.locator("#plan-prep")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#plan-prep")).toHaveAccessibleDescription(
    /Over Budget: at most 33 ha/,
  );
  await expect(prepSlider).toHaveAccessibleDescription(/at most 33 ha/);
  await expect(page.locator("#plan-hectares-error")).toBeHidden();
  await expect(page.locator("#plan-fertilizer-error")).toBeHidden();
  await expect(page.locator("#plan-hectares-affordable")).toHaveText(
    "Up to 0 ha affordable",
  );
  await expect(page.locator("#plan-error")).toBeVisible();
  await expect(page.locator("#confirm-btn")).toBeDisabled();

  // The slider still reaches the unaffordable range.
  await prepSlider.press("End");
  await expect(page.locator("#plan-prep")).toHaveValue("1600");
  await expect(inline).toBeVisible();

  await page.locator("#plan-prep").fill("0");
  await expect(inline).toBeHidden();
  await expect(page.locator("#plan-prep")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  await expect(page.locator("#plan-prep")).not.toHaveAccessibleDescription(
    /Over Budget/,
  );
  await expect(page.locator("#confirm-btn")).toBeEnabled();
});

test("the allocation slider preserves retained-food bounds and agrees with saved accounting", async ({
  page,
}) => {
  await fixture(page, { runSeed: 29, state: { storageTons: 2000 } });
  await page.locator("#suggest-plan-btn").click();
  await expect(page.locator("#forecast-flood-balance")).toHaveText(
    "1,460 t Surplus",
  );
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-event")).toContainText("Flood");
  await expect(page.locator("#stats-note")).toBeVisible();
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
  await expect(page.locator("#stats-note")).toBeHidden();
});

test("allocation defaults to the minimum Storage and previews both extremes", async ({
  page,
}) => {
  await fixture(page);
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  const pending = await stored(page);
  const checkDefault = async () => {
    await expect(page.locator("#plan-store")).toHaveValue("0");
    await expect(page.locator("#plan-store-slider")).toHaveValue("0");
    await expect(page.locator("#plan-store")).toHaveAttribute("max", "600");
    await expect(page.locator("#allocation-exported")).toHaveText("600 t");
    await expect(page.locator("#allocation-next-budget")).toHaveText(
      "12,200 coins",
    );
    await expect(page.locator("#store-min-outcome")).toHaveText(
      "0 t kept · next Budget 12,200 coins",
    );
    await expect(page.locator("#store-max-outcome")).toHaveText(
      "600 t kept · next Budget 5,600 coins",
    );
  };
  await checkDefault();
  await page.locator("#store-max-btn").click();
  await expect(page.locator("#plan-store")).toHaveValue("600");
  await expect(page.locator("#allocation-next-budget")).toHaveText(
    "5,600 coins",
  );
  await expect(page.locator("#store-min-outcome")).toHaveText(
    "0 t kept · next Budget 12,200 coins",
  );
  expect(await stored(page)).toBe(pending);
  await page.reload();
  expect(await stored(page)).toBe(pending);
  await checkDefault();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#stat-budget")).toHaveText("12,200 coins");
  await expect(page.locator("#report-storage-summary")).toHaveText("0 t");
});

test("each outcome screen has one headline led by the key number and a readable stat row", async ({
  page,
}) => {
  const fontSize = async (id) =>
    Number.parseFloat(
      await page
        .locator(id)
        .evaluate((node) => getComputedStyle(node).fontSize),
    );
  await fixture(page);
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-title")).toBeFocused();
  await expect(page.locator("#allocation-outcome-lead")).toHaveText(
    "+50 people",
  );
  await expect(page.locator("#allocation-famine")).toHaveText("No famine");
  await expect(page.locator("#allocation-population-change")).toHaveText(
    "1,000 → 1,050 (+50)",
  );
  // The Event is stated once, as supporting context.
  await expect(page.locator("#allocation-event")).toHaveText("No event");
  await expect(page.locator("#allocation")).not.toContainText(
    /ordinary year|people are fed/i,
  );
  await expect(page.locator("#allocation h3")).toHaveCount(0);
  expect(await fontSize("#allocation-outcome-lead")).toBeGreaterThanOrEqual(24);
  const statSize = await fontSize("#allocation-harvest");
  expect(statSize).toBeGreaterThanOrEqual(16);
  expect(await fontSize("#allocation-population-change")).toBe(statSize);

  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-title")).toBeFocused();
  await expect(page.locator("#report-outcome-lead")).toHaveText("+50 people");
  await expect(page.locator("#report-famine")).toHaveText("No famine");
  await expect(page.locator("#report-population-summary")).toHaveText(
    "1,000 → 1,050 (+50)",
  );
  await expect(page.locator("#report-budget-summary")).toHaveText(
    "12,200 coins",
  );
  for (const id of [
    "#report-population-summary",
    "#report-storage-summary",
    "#report-budget-summary",
  ]) {
    expect(await fontSize(id)).toBe(statSize);
  }

  // Famine leads with the shortfall in tons and names it in words.
  await fixture(page);
  await page.locator("#plan-hectares").fill("300");
  await page.locator("#plan-fertilizer").fill("0");
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation-outcome-lead")).toHaveText(
    "400 t shortfall",
  );
  await expect(page.locator("#allocation-famine")).toHaveText("Partial famine");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report-outcome-lead")).toHaveText(
    "400 t shortfall",
  );
  await expect(page.locator("#report-famine")).toHaveText("Partial famine");
});

test("the next Year carries the previous plan forward and Resolve warns about a forecast shortfall", async ({
  page,
}) => {
  await fixture(page);
  const confirm = page.locator("#confirm-btn");
  await expect(confirm).toHaveText("Resolve with 200 t shortfall");
  await expect(confirm).toHaveClass(/warning/);
  await expect(confirm).toBeEnabled();
  await page.locator("#suggest-plan-btn").click();
  await expect(confirm).toHaveText("Resolve harvest");
  await expect(confirm).not.toHaveClass(/warning/);
  await confirm.click();
  await page.locator("#store-min-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#stat-year")).toHaveText("2");
  await expect(page.locator("#first-plan")).toBeHidden();
  await expect(page.locator("#plan-hectares")).toHaveValue("400");
  await expect(page.locator("#plan-fertilizer")).toHaveValue("400");
  await expect(page.locator("#plan-fertilizer-slider")).toHaveValue("400");
  await expect(page.locator("#plan-prep")).toHaveValue("0");
  await expect(confirm).toHaveText("Resolve harvest");
  await expect(confirm).not.toHaveClass(/warning/);
  await page.locator("#plan-fertilizer").fill("0");
  await expect(page.locator("#forecast-balance")).toHaveText(
    "250 t shortfall before Events",
  );
  await expect(confirm).toHaveText("Resolve with 250 t shortfall");
  await expect(confirm).toHaveClass(/warning/);
  await expect(confirm).toBeEnabled();
  await page.reload();
  await expect(page.locator("#plan-fertilizer")).toHaveValue("400");
  await page.locator("#plan-fertilizer").fill("0");
  await confirm.click();
  await expect(page.locator("#allocation")).toBeVisible();
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

test("keyboard reaches every Technology before Resolve harvest, and Technologies hide during allocation", async ({
  page,
}) => {
  await fixture(page);
  const technologies = await page
    .locator("#technologies input[type=checkbox]")
    .evaluateAll((inputs) => inputs.map((input) => input.id));
  expect(technologies.length).toBeGreaterThan(0);
  const reached = [];
  await page.locator("#plan-prep").focus();
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.id);
    if (id === "confirm-btn") break;
    if (technologies.includes(id)) reached.push(id);
  }
  await expect(page.locator("#confirm-btn")).toBeFocused();
  expect(reached).toEqual(technologies);
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  await expect(page.locator("#technologies")).toBeHidden();
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
  await expect(page.locator("#turn-status")).toHaveText(/^Run complete/);
  const collapsed = await stored(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#collapse-restart-btn").click();
  expect(await stored(page)).toBe(collapsed);
  await page.reload();
  await expect(page.locator("#production")).toBeHidden();
  await page.locator("#report-details summary").click();
  await expect(page.locator("#report-famine")).toHaveText("Total famine");
  await expect(page.locator("#report-available")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#collapse-restart-btn").click();
  await expect(page.locator("#production")).toBeVisible();
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#event-log li")).toHaveCount(0);
});

for (const { name, runSeed, state, hectares, cause, event, score } of [
  {
    name: "total Famine",
    runSeed: 5,
    state: {},
    hectares: "0",
    cause:
      "Total famine: Harvest 0 t and 0 t stored against 1,000 t needed. No one could be fed, so the population reached zero.",
    event: null,
    score: "1,000",
  },
  {
    name: "a fall below half the starting population",
    runSeed: 5,
    state: { population: 1277, highestPopulation: 1300, storageTons: 73 },
    hectares: "100",
    cause:
      "Partial famine: Harvest 200 t and 73 t stored against 1,277 t needed. Population fell from 1,277 to 273, below half the starting 1,000.",
    event: null,
    score: "1,300",
  },
  {
    name: "a flood that leaves the population below half",
    runSeed: 43,
    state: { storageTons: 200 },
    hectares: "100",
    cause:
      "Partial famine: Harvest 120 t and 150 t stored against 1,000 t needed. Population fell from 1,000 to 270, below half the starting 1,000.",
    event: /^Flood: /,
    score: "1,000",
  },
]) {
  test(`the Collapse summary explains ${name} with the final Year's food figures`, async ({
    page,
  }) => {
    await fixture(page, { runSeed, state });
    await expect(page.locator("#milestone-meter")).toBeVisible();
    await page.locator("#plan-hectares").fill(hectares);
    await page.locator("#plan-fertilizer").fill("0");
    await page.locator("#confirm-btn").click();
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#collapse-summary")).toBeVisible();
    await expect(page.locator("#collapse-cause")).toHaveText(cause);
    if (event) await expect(page.locator("#collapse-event")).toHaveText(event);
    else await expect(page.locator("#collapse-event")).toBeHidden();
    await expect(page.locator("#collapse-length")).toHaveText("1 Year");
    await expect(page.locator("#collapse-score")).toHaveText(score);
    await expect(page.locator("#milestone-meter")).toBeHidden();
    await page.reload();
    await expect(page.locator("#collapse-cause")).toHaveText(cause);
    await expect(page.locator("#milestone-meter")).toBeHidden();
    const collapsed = await stored(page);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#collapse-restart-btn").click();
    expect(await stored(page)).toBe(collapsed);
    await expect(page.locator("#collapse-cause")).toHaveText(cause);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#collapse-restart-btn").click();
    await expect(page.locator("#collapse-summary")).toBeHidden();
    await expect(page.locator("#milestone-meter")).toBeVisible();
  });
}

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
  await expect(page.locator("#milestone-caption")).toContainText("Score 2,048");
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

// Counts "Year <n>" mentions in text currently rendered inside the viewport.
const visibleYearMentions = (page, year) =>
  page.evaluate((year) => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !parent?.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const box = range.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= innerHeight || box.width === 0) {
        continue;
      }
      parts.push(node.textContent.trim());
    }
    return (
      parts.join(" ").match(new RegExp(`\\bYear\\s+${year}\\b`, "g")) ?? []
    ).length;
  }, year);

for (const width of [390, 1280]) {
  test(`the ${width}px header shows four resources, one opening note and the Year at most twice`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    const labels = page.locator(".stats .stat .label");
    const primary = ["Year", "Population", "Storage", "Budget"];
    await expect(labels).toHaveText(primary);
    await expect(page.locator("#stat-population-change")).toHaveText("");
    await expect(page.locator(".turn-steps")).toHaveCount(0);
    await expect(page.locator("#milestone-caption")).toContainText(
      "Score 1,000",
    );
    expect(await visibleYearMentions(page, 1)).toBeLessThanOrEqual(2);
    await page.locator("#suggest-plan-btn").click();
    await page.locator("#confirm-btn").click();
    await expect(page.locator("#stats-note")).toBeVisible();
    await expect(page.locator("#stats-note")).toHaveText(/Opening values/);
    await expect(labels).toHaveText(primary);
    await expect(page.locator("#allocation-price")).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0));
    expect(await visibleYearMentions(page, 1)).toBeLessThanOrEqual(2);
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#stats-note")).toBeHidden();
    await expect(page.locator("#stat-population")).toHaveText("1,050");
    await expect(page.locator("#stat-population-change")).toHaveText(
      "+50 last Year",
    );
    await page.evaluate(() => scrollTo(0, 0));
    expect(await visibleYearMentions(page, 2)).toBeLessThanOrEqual(2);
  });
}
