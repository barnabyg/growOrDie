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

const fill = (locator) =>
  locator.evaluate((node) => getComputedStyle(node).fill);

test("legend swatches are drawn like the land they describe, including weather tints", async ({
  page,
}) => {
  await fixture(page, { runSeed: 4 });
  await page.locator("#suggest-plan-btn").click();
  const legend = page.locator(".land-legend");
  const swatch = (category) => legend.locator(`.swatch.${category}`);
  const unprepared = page.locator("#country-fields .unprepared-field").last();
  const prepared = page.locator("#country-fields .prepared-field").first();
  const crop = page.locator("#country-green rect").first();
  expect(await fill(swatch("unprepared").locator("rect"))).toBe(
    await fill(unprepared),
  );
  // Unprepared parcels are drawn with a tree, so the swatch shows one too.
  await expect(
    swatch("unprepared").locator('use[href="#land-tree"]'),
  ).toHaveCount(1);
  expect(await fill(swatch("prepared").locator("rect"))).toBe(
    await fill(prepared),
  );
  const cropSwatch = swatch("cultivated").locator("rect").first();
  expect(await fill(cropSwatch)).toBe(await fill(crop));
  await expect(
    swatch("cultivated").locator('rect[fill="url(#crop-rows)"]'),
  ).toHaveCount(1);
  // Seed 4 resolves a drought: the cultivated swatch follows the brown tint.
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#country-green")).toHaveClass(/drought/);
  expect(await fill(cropSwatch)).toBe("rgb(169, 113, 66)");
  // The drawn crops reach the same colour once their tint transition ends.
  await expect.poll(() => fill(crop)).toBe(await fill(cropSwatch));
});

test("faded houses are explained only when Population is below its peak", async ({
  page,
}) => {
  await fixture(page, {
    state: { population: 1000, highestPopulation: 2600 },
  });
  const houses = page.locator(".village-house");
  await expect(houses.nth(1)).toHaveAttribute("opacity", "1");
  await expect(houses.nth(2)).toHaveAttribute("opacity", "0.2");
  await expect(page.locator("#country-caption")).toContainText(
    "Faded houses show Population lost since its peak.",
  );
  await fixture(page);
  await expect(page.locator("#country-caption")).not.toContainText(
    "Faded houses",
  );
});

test("loading shows the village without animating, while later changes still animate", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.landscapeTransitions = [];
    document.addEventListener("transitionrun", (event) => {
      if (event.target.closest?.("#country-svg"))
        window.landscapeTransitions.push(
          event.target.id || event.target.getAttribute("class"),
        );
    });
  });
  await fixture(page, { runSeed: 4 });
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#country-green")).toHaveClass(/drought/);
  await page.reload();
  await expect(page.locator(".village-house").nth(2)).toHaveAttribute(
    "opacity",
    "0",
  );
  await expect(page.locator("#country-green")).toHaveClass(/drought/);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.landscapeTransitions)).toEqual([]);
  // After loading, changes still animate: planning the next year clears the
  // drought tint from the preview.
  await page.locator("#allocate-btn").click();
  await page.locator("#cultivate-all-btn").click();
  await expect(page.locator("#country-green")).not.toHaveClass(/drought/);
  await expect
    .poll(() => page.evaluate(() => window.landscapeTransitions))
    .toContain("country-green");
});

test("on desktop the chronicle continues the country column beside the decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page);
  // The chronicle sits directly beneath the country, level with the right
  // column; screens with one decision panel leave no large empty column.
  const columns = async (screen, { balanced }) => {
    const box = await page.evaluate(() => {
      const rect = (selector) =>
        document.querySelector(selector).getBoundingClientRect();
      const visible = [
        ...document.querySelectorAll("main > .content > section"),
      ]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.getBoundingClientRect());
      return {
        country: rect("main > .country"),
        history: rect("main > .history-section"),
        rightTop: Math.min(...visible.map((r) => r.top)),
        rightLeft: Math.min(...visible.map((r) => r.left)),
        rightBottom: Math.max(...visible.map((r) => r.bottom)),
      };
    });
    const message = `${screen}: ${JSON.stringify(box)}`;
    expect(box.history.left, message).toBe(box.country.left);
    expect(box.history.top - box.country.bottom, message).toBeLessThan(25);
    expect(Math.abs(box.country.top - box.rightTop), message).toBeLessThan(1);
    expect(box.history.right, message).toBeLessThan(box.rightLeft);
    if (balanced)
      expect(
        Math.abs(box.history.bottom - box.rightBottom),
        message,
      ).toBeLessThan(400);
  };
  await columns("plan", { balanced: false });
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  await columns("allocation", { balanced: true });
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report")).toBeVisible();
  await columns("report", { balanced: false });
  await page.locator("#plan-hectares").fill("0");
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  for (
    let i = 0;
    i < 5 && !(await page.locator("#collapse-summary").isVisible());
    i++
  ) {
    await page.locator("#plan-hectares").fill("0");
    await page.locator("#confirm-btn").click();
    await page.locator("#allocate-btn").click();
  }
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await columns("Collapse", { balanced: true });
});
