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

for (const width of [320, 390, 760, 1280]) {
  for (const scale of [1, 2]) {
    test(`layout fits ${width}px with ${scale * 100}% text through gameplay`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => {
        Math.random = () => 5 / 0x7fffffff;
      });
      await page.goto(origin);
      await page.addStyleTag({
        content: `html { font-size: ${16 * scale}px; }`,
      });
      const fits = async () => {
        const dimensions = await page.evaluate(() => ({
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
        for (const row of await page.locator(".tech-row:visible").all()) {
          const boxes = await row
            .locator(
              "input, label, .tech-cost, .tech-effect, .tech-owned:visible",
            )
            .evaluateAll((nodes) =>
              nodes.map((node) => {
                const box = node.getBoundingClientRect();
                return {
                  left: box.left,
                  right: box.right,
                  top: box.top,
                  bottom: box.bottom,
                  width: box.width,
                  height: box.height,
                };
              }),
            );
          for (const box of boxes) {
            expect(box.left).toBeGreaterThanOrEqual(0);
            expect(box.right).toBeLessThanOrEqual(width);
            expect(box.width).toBeGreaterThan(0);
          }
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i];
              const b = boxes[j];
              expect(
                Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
                  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
              ).toBe(false);
            }
          }
        }
      };
      await fits();
      await page.locator("#tech-irrigation").check();
      await page.locator("#plan-fertilizer").fill("400");
      await page.locator("#confirm-btn").click();
      await expect(page.locator("#allocation")).toBeVisible();
      await fits();
      await page.locator("#allocate-btn").click();
      await expect(page.locator("#report")).toBeVisible();
      await expect(page.locator("#tech-irrigation-owned")).toBeVisible();
      await fits();
      await page.locator("#plan-hectares").fill("0");
      await page.locator("#confirm-btn").click();
      await page.locator("#allocate-btn").click();
      // If retained food postpones Collapse, another empty harvest exhausts it.
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
      await fits();
    });
  }
}
