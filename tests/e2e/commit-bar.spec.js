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

const bar = (page) => page.locator("#commit-bar");
const barButton = (page) => page.locator("#commit-bar-btn");
const barValues = (page) => page.locator("#commit-bar dd");
const barLabels = (page) => page.locator("#commit-bar dt");

// The bar button must agree with the in-page commit button it stands in for.
async function expectMirrors(page, sourceId) {
  const source = page.locator(`#${sourceId}`);
  await expect(barButton(page)).toHaveText(
    ((await source.textContent()) ?? "").trim(),
  );
  const [sourceState, barState] = await Promise.all(
    [source, barButton(page)].map((button) =>
      button.evaluate((node) => ({
        disabled: node.disabled,
        warning: node.classList.contains("warning"),
      })),
    ),
  );
  expect(barState).toEqual(sourceState);
}

// Viewport top of the bar; content above it is not covered.
const barTop = (page) =>
  bar(page).evaluate((node) => node.getBoundingClientRect().top);

test("on a phone the pinned bar tracks the plan and allocation and commits each decision", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);

  await expect(bar(page)).toBeVisible();
  const box = await bar(page).boundingBox();
  expect(box.y + box.height).toBeCloseTo(844, 0);
  await expect(barLabels(page)).toHaveText(["Food", "Budget after plan"]);
  await expect(barValues(page)).toHaveText([
    "200 t shortfall",
    (await page.locator("#plan-remaining").textContent()) ?? "",
  ]);
  await expect(barButton(page)).toHaveText("Resolve with 200 t shortfall");
  await expect(barButton(page)).toHaveClass(/warning/);
  await expectMirrors(page, "confirm-btn");

  // Values update live while the plan changes.
  await page.locator("#suggest-plan-btn").click();
  await expect(barValues(page).first()).toHaveText("600 t Surplus");
  await expect(barValues(page).nth(1)).toHaveText(
    (await page.locator("#plan-remaining").textContent()) ?? "",
  );
  await expect(barButton(page)).toHaveText("Resolve harvest");
  await expect(barButton(page)).not.toHaveClass(/warning/);
  await expectMirrors(page, "confirm-btn");

  // An unaffordable plan disables both commit buttons.
  await page.locator("#plan-prep").fill("1600");
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await expect(barButton(page)).toBeDisabled();
  await expect(barValues(page).nth(1)).toHaveClass(/overspend/);
  await expectMirrors(page, "confirm-btn");
  await page.locator("#plan-prep").fill("0");
  await expect(barButton(page)).toBeEnabled();

  await barButton(page).click();
  await expect(page.locator("#allocation")).toBeVisible();
  await expect(barLabels(page)).toHaveText([
    "Storage kept",
    "Next-year Budget",
  ]);
  await expect(barValues(page)).toHaveText([
    (await page.locator("#allocation-stored").textContent()) ?? "",
    (await page.locator("#allocation-next-budget").textContent()) ?? "",
  ]);
  await expect(barButton(page)).toHaveText("Finish year");
  await expectMirrors(page, "allocate-btn");

  await page.locator("#store-max-btn").click();
  await expect(barValues(page)).toHaveText([
    (await page.locator("#allocation-stored").textContent()) ?? "",
    (await page.locator("#allocation-next-budget").textContent()) ?? "",
  ]);

  await page.locator("#plan-store").fill("-1");
  await expect(page.locator("#allocate-btn")).toBeDisabled();
  await expect(barButton(page)).toBeDisabled();
  await expect(barValues(page)).toHaveText(["—", "—"]);
  await page.locator("#store-min-btn").click();
  await expect(barButton(page)).toBeEnabled();

  await barButton(page).click();
  await expect(page.locator("#report")).toBeVisible();
  await expect(page.locator("#stat-population")).toHaveText("1,050");
  await expect(barLabels(page)).toHaveText(["Food", "Budget after plan"]);
});

test("the bar leaves focused inputs and the end of the page uncovered", async ({
  page,
}) => {
  // A short phone screen, so the first production input starts behind the bar.
  await page.setViewportSize({ width: 390, height: 680 });
  await fixture(page);
  for (const id of ["plan-prep", "tech-irrigation", "tech-fertilizerWorks"]) {
    // Park the input just behind the bar, then focus it.
    await page.locator(`#${id}`).evaluate((node) => {
      const box = node.getBoundingClientRect();
      scrollBy(0, box.bottom - innerHeight + 4);
    });
    expect(
      await page
        .locator(`#${id}`)
        .evaluate((node) => node.getBoundingClientRect().bottom),
    ).toBeGreaterThan(await barTop(page));
    await page.locator(`#${id}`).focus();
    const bottom = await page
      .locator(`#${id}`)
      .evaluate((node) => node.getBoundingClientRect().bottom);
    expect(bottom, id).toBeLessThanOrEqual(await barTop(page));
  }
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const lastBottom = await page
    .locator("footer.help")
    .evaluate((node) => node.getBoundingClientRect().bottom);
  // The maximum scroll offset is rounded, so allow sub-pixel overlap.
  expect(lastBottom).toBeLessThanOrEqual((await barTop(page)) + 1);
});

test("the bar is absent on desktop and after Collapse", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page);
  await expect(page.locator("#confirm-btn")).toBeVisible();
  await expect(bar(page)).toBeHidden();

  // Empty harvests lead to Collapse; retained food may postpone it a Year or two.
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  for (
    let i = 0;
    i < 6 && !(await page.locator("#collapse-summary").isVisible());
    i++
  ) {
    await page.locator("#plan-hectares").fill("0");
    await barButton(page).click();
    await barButton(page).click();
  }
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await expect(bar(page)).toBeHidden();
  const padding = await page.evaluate(
    () => getComputedStyle(document.body).paddingBottom,
  );
  expect(padding).toBe("0px");
});
