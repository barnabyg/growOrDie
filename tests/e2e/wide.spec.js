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

// A maximized browser on a 4K screen at 200%, 150% and 100% display scaling.
for (const [width, height] of [
  [1920, 930],
  [2560, 1310],
  [3840, 2020],
]) {
  test(`every screen fills a ${width}x${height} window without page scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      Math.random = () => 5 / 0x7fffffff;
    });
    await page.goto(origin);

    const fills = async (screen, commit) => {
      const box = await page.evaluate(() => {
        const rect = (selector) =>
          document.querySelector(selector).getBoundingClientRect();
        const root = document.documentElement;
        return {
          pageHeight: root.scrollHeight,
          pageWidth: root.scrollWidth,
          country: rect(".country"),
          history: rect(".history-section"),
          footer: rect(".help"),
          art: rect("#country-svg"),
        };
      });
      const message = `${screen}: ${JSON.stringify(box)}`;
      expect(box.pageHeight, message).toBeLessThanOrEqual(height);
      expect(box.pageWidth, message).toBeLessThanOrEqual(width);
      // The three columns span the window, with only a small margin each side.
      expect(box.country.left, message).toBeLessThan(width * 0.02);
      expect(box.history.right, message).toBeGreaterThan(width * 0.98);
      // The landscape is at least a quarter of the window wide, and tall.
      expect(box.art.width, message).toBeGreaterThan(width * 0.25);
      expect(box.art.height, message).toBeGreaterThan(height * 0.4);
      expect(box.footer.bottom, message).toBeLessThanOrEqual(height);
      await expect(page.locator(commit)).toBeInViewport({ ratio: 1 });
      await expect(page.locator("#restart-btn")).toBeInViewport({ ratio: 1 });
    };

    await fills("plan", "#confirm-btn");
    // Expanding a disclosure scrolls its own column, not the page: the commit
    // button stays on screen.
    await page.getByText("Weather scenarios").click();
    await page.getByText("Spending breakdown").click();
    await fills("plan with details", "#confirm-btn");
    await page.getByText("Weather scenarios").click();
    await page.getByText("Spending breakdown").click();

    await page.locator("#suggest-plan-btn").click();
    // With the Budget spent every Technology shows its "Need coins" line, and
    // all six cards still fit.
    await page.locator("#plan-prep").fill("33");
    await expect(page.locator(".tech-status:visible")).toHaveCount(6);
    expect(
      await page
        .locator("#technologies")
        .evaluate((node) => node.scrollHeight - node.clientHeight),
    ).toBeLessThanOrEqual(1);
    await page.locator("#plan-prep").fill("0");
    await page.locator("#confirm-btn").click();
    await expect(page.locator("#allocation")).toBeVisible();
    await expect(page.locator("#stats-note")).toBeInViewport();
    await fills("allocation", "#allocate-btn");

    await page.locator("#allocate-btn").click();
    await expect(page.locator("#report")).toBeVisible();
    await fills("report", "#confirm-btn");
    // The report tops the right column, above the chronicle.
    const [history, report] = await page
      .locator(".history-section, #report")
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect()));
    expect(report.top).toBeLessThan(history.top);
    expect(Math.abs(report.left - history.left)).toBeLessThan(1);
    await page.locator("#report-details summary").click();
    await fills("report details", "#confirm-btn");
    await expect(page.locator(".history-section h2")).toBeInViewport();
    await page.locator("#report-details summary").click();

    // How to play opens over the panels instead of moving them.
    const before = await page.locator(".country").boundingBox();
    await page.getByText("How to play").click();
    await expect(page.getByText("Feed your people")).toBeInViewport();
    expect(await page.locator(".country").boundingBox()).toEqual(before);
    await page.getByText("How to play").click();

    for (
      let i = 0;
      i < 6 && !(await page.locator("#collapse-summary").isVisible());
      i++
    ) {
      await page.locator("#plan-hectares").fill("0");
      await page.locator("#confirm-btn").click();
      await page.locator("#allocate-btn").click();
    }
    await expect(page.locator("#collapse-summary")).toBeVisible();
    await expect(page.locator("#production")).toBeHidden();
    await fills("Collapse", "#collapse-restart-btn");
  });
}

test("large slider thumbs keep the unaffordable band aligned, and small windows keep the normal layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 3840, height: 2020 });
  await page.goto(origin);
  // Scaled up with the text, unlike a browser's fixed-size default.
  const thumb = await page
    .locator("#plan-prep-slider")
    .evaluate((node) =>
      Number.parseFloat(getComputedStyle(node, "::-webkit-slider-thumb").width),
    );
  expect(thumb).toBeGreaterThan(30);
  // The band's start follows the same thumb size.
  expect(
    await page
      .locator("#plan-prep-range")
      .evaluate((node) => getComputedStyle(node).getPropertyValue("--thumb")),
  ).toBe("1.3rem");

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(() => ({
      root: getComputedStyle(document.documentElement).fontSize,
      scrolls: document.documentElement.scrollHeight > innerHeight,
    })),
  ).toEqual({ root: "16px", scrolls: true });
});
