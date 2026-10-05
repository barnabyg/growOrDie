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
      // Technologies are part of the plan: they precede spending and Resolve.
      const top = (selector) =>
        page.locator(selector).evaluate((n) => n.getBoundingClientRect().top);
      const lastTechBottom = await page
        .locator(".tech-row")
        .evaluateAll((rows) =>
          Math.max(...rows.map((row) => row.getBoundingClientRect().bottom)),
        );
      expect(await top(".production-fields")).toBeLessThan(
        await top("#technologies"),
      );
      expect(lastTechBottom).toBeLessThanOrEqual(await top("#budget-summary"));
      expect(await top("#budget-summary")).toBeLessThan(
        await top("#confirm-btn"),
      );
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

const shortcutChips = {
  plan: ["suggest-plan-btn", "cultivate-all-btn", "fertilize-all-btn"],
  allocation: ["store-min-btn", "store-max-btn"],
};

const chipStyles = (page, ids) =>
  page.evaluate((chipIds) => {
    const channels = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (value) => {
      const [r, g, b] = channels(value).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const backdrop = (node) => {
      for (let n = node.parentElement; n; n = n.parentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)") return bg;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    return chipIds.map((id) => {
      const node = document.getElementById(id);
      const style = getComputedStyle(node);
      const behind = backdrop(node);
      return {
        id,
        height: node.getBoundingClientRect().height,
        borderStyle: style.borderTopStyle,
        borderWidth: Number.parseFloat(style.borderTopWidth),
        borderRadius: style.borderTopLeftRadius,
        background: style.backgroundColor,
        color: style.color,
        opacity: style.opacity,
        cursor: style.cursor,
        textContrast: contrast(style.color, behind),
        borderContrast: contrast(style.borderTopColor, behind),
      };
    });
  }, ids);

for (const pointer of ["fine", "coarse"]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`shortcut chips are bounded controls with a ${pointer} pointer in ${colorScheme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        colorScheme,
        ...(pointer === "coarse"
          ? {
              hasTouch: true,
              isMobile: true,
              viewport: { width: 390, height: 900 },
            }
          : {}),
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        Math.random = () => 5 / 0x7fffffff;
      });
      await page.goto(origin);
      expect(
        await page.evaluate(
          (p) => matchMedia(`(pointer: ${p})`).matches,
          pointer,
        ),
      ).toBe(true);
      const minHeight = pointer === "coarse" ? 44 : 24;
      const [primary, secondary] = await page.evaluate(() =>
        ["confirm-btn", "restart-btn"].map((id) => {
          const style = getComputedStyle(document.getElementById(id));
          return {
            background: style.backgroundColor,
            borderRadius: style.borderTopLeftRadius,
          };
        }),
      );
      const checkChips = async (ids) => {
        for (const chip of await chipStyles(page, ids)) {
          expect(chip.borderStyle, chip.id).toBe("solid");
          expect(chip.borderWidth, chip.id).toBeGreaterThanOrEqual(1);
          expect(chip.height, chip.id).toBeGreaterThanOrEqual(minHeight);
          expect(chip.textContrast, chip.id).toBeGreaterThanOrEqual(4.5);
          expect(chip.borderContrast, chip.id).toBeGreaterThanOrEqual(3);
          expect(chip.background, chip.id).not.toBe(primary.background);
          expect(chip.borderRadius, chip.id).not.toBe(secondary.borderRadius);
        }
      };
      await checkChips(shortcutChips.plan);

      const chip = page.locator("#cultivate-all-btn");
      const [resting] = await chipStyles(page, ["cultivate-all-btn"]);
      if (pointer === "fine") {
        await chip.hover();
        const [hovered] = await chipStyles(page, ["cultivate-all-btn"]);
        expect(hovered.background).not.toBe(resting.background);
        await page.mouse.move(0, 0);
      }
      await chip.evaluate((node) => {
        node.disabled = true;
      });
      const [disabled] = await chipStyles(page, ["cultivate-all-btn"]);
      expect(disabled.borderStyle).toBe("dashed");
      expect(disabled.opacity).toBe("1");
      expect(disabled.cursor).toBe("not-allowed");
      expect(disabled.color).not.toBe(resting.color);
      expect(disabled.textContrast).toBeGreaterThanOrEqual(4.5);
      await chip.evaluate((node) => {
        node.disabled = false;
      });

      await page.locator("#suggest-plan-btn").click();
      await page.locator("#confirm-btn").click();
      await expect(page.locator("#allocation")).toBeVisible();
      await expect(page.locator("#store-max-btn")).toBeEnabled();
      await checkChips(shortcutChips.allocation);
      const outcomes = ["store-min-outcome", "store-max-outcome"];
      for (const id of outcomes) {
        await expect(page.locator(`#${id}`)).not.toBeEmpty();
      }
      for (const outcome of await chipStyles(page, outcomes)) {
        expect(outcome.textContrast, outcome.id).toBeGreaterThanOrEqual(4.5);
      }
      await context.close();
    });
  }
}
