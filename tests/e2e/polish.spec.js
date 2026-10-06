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

// Plan, allocation and report screens with every optional text revealed:
// weather scenarios, Technology statuses, an overspend message, How to play
// and the report's accounting details.
async function eachScreen(page, check) {
  await fixture(page, { state: { ownedTechnologies: ["granary"] } });
  await page.locator("footer.help summary").click();
  await page.getByText("Weather scenarios", { exact: true }).click();
  await page.locator("#tech-irrigation").check();
  await page.locator("#plan-prep").fill("1000");
  await expect(page.locator("#plan-prep-error")).toBeVisible();
  await check("plan");
  await page.locator("#tech-irrigation").uncheck();
  await page.locator("#plan-prep").fill("0");
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  await check("allocation");
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report")).toBeVisible();
  await page.getByText("Harvest, Event & Budget details").click();
  await check("report");
}

// Visible elements holding their own text, with computed font sizes in px.
const textSizes = (page) =>
  page.evaluate(() =>
    [...document.body.querySelectorAll("*")]
      .filter(
        (node) =>
          node.getClientRects().length > 0 &&
          getComputedStyle(node).visibility === "visible" &&
          !node.closest(".sr-only, svg, script, style") &&
          [...node.childNodes].some(
            (child) => child.nodeType === 3 && child.textContent.trim(),
          ),
      )
      .map((node) => ({
        text: node.textContent.trim().slice(0, 40),
        size: Number.parseFloat(getComputedStyle(node).fontSize),
      })),
  );

for (const width of [1280, 390]) {
  test(`no visible text is smaller than 13 px at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await eachScreen(page, async (screen) => {
      const small = (await textSizes(page)).filter(({ size }) => size < 13);
      expect(small, screen).toEqual([]);
    });
  });
}

// Ink top and bottom (px) of each digit 0–9 set in `node`'s own font. A probe
// appended to the node inherits its font exactly; it is drawn black on white
// so ink is any dark pixel. Lining figures share one top and baseline, while
// old-style figures rise to x-height or ascender and 3, 4, 5, 7 and 9 descend.
async function digitInk(page, node) {
  const columns = await node.evaluate((element) => {
    const probe = document.createElement("span");
    probe.dataset.liningProbe = "";
    probe.style.cssText =
      "position:fixed;top:0;left:0;z-index:9999;padding:8px;" +
      "background:#fff;color:#000;white-space:nowrap;text-shadow:none";
    for (const digit of "0123456789")
      probe.append(
        Object.assign(document.createElement("span"), {
          textContent: digit,
        }),
      );
    element.append(probe);
    const origin = probe.getBoundingClientRect();
    return [...probe.children].map((digit) => {
      const box = digit.getBoundingClientRect();
      return {
        left: Math.round(box.left - origin.left),
        width: Math.round(box.width),
      };
    });
  });
  const probe = page.locator("[data-lining-probe]");
  // Finish reveal fades first so a half-transparent ancestor cannot lighten ink.
  const png = (await probe.screenshot({ animations: "disabled" })).toString(
    "base64",
  );
  await probe.evaluate((element) => element.remove());
  return page.evaluate(
    async ({ png, columns }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(
        0,
        0,
        image.width,
        image.height,
      );
      // Darker than mid-grey, so anti-aliased edges count as ink only past half.
      const dark = (x, y) => {
        const i = (y * width + x) * 4;
        return data[i] + data[i + 1] + data[i + 2] < 384;
      };
      return columns.map(({ left, width: span }) => {
        const rows = [];
        for (let y = 0; y < height; y++)
          for (let x = left; x < left + span; x++)
            if (dark(x, y)) {
              rows.push(y);
              break;
            }
        return { top: rows[0], bottom: rows.at(-1) };
      });
    },
    { png, columns },
  );
}

test("serif headings and headline numbers render lining figures", async ({
  page,
}) => {
  await eachScreen(page, async (screen) => {
    // Visible serif elements whose own text holds digits, e.g. "Year 1", the
    // outcome headline's number and "1,004 people lost".
    const texts = await page.evaluate(() => {
      for (const node of document.querySelectorAll("[data-numeral-check]"))
        delete node.dataset.numeralCheck;
      return [...document.body.querySelectorAll("*")]
        .filter(
          (node) =>
            node.getClientRects().length > 0 &&
            /Georgia/.test(getComputedStyle(node).fontFamily) &&
            [...node.childNodes].some(
              (child) => child.nodeType === 3 && /\d/.test(child.textContent),
            ),
        )
        .map((node, index) => {
          node.dataset.numeralCheck = String(index);
          return node.textContent.trim().slice(0, 40);
        });
    });
    // Year headings and the outcome headline's number are always present.
    expect(texts.length, screen).toBeGreaterThan(0);
    for (const [index, text] of texts.entries()) {
      const ink = await digitInk(
        page,
        page.locator(`[data-numeral-check="${index}"]`),
      );
      const spread = (edge) =>
        Math.max(...ink.map((digit) => digit[edge])) -
        Math.min(...ink.map((digit) => digit[edge]));
      // Lining digits measure the same; allow a pixel for round-digit overshoot.
      // Old-style Georgia differs by 4 px even in the smallest numeric heading.
      expect(spread("top"), `${screen}: ${text} tops`).toBeLessThanOrEqual(1);
      expect(
        spread("bottom"),
        `${screen}: ${text} baselines`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

for (const colorScheme of ["light", "dark"]) {
  test(`number inputs look editable and meet 3:1 boundary contrast in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    const measure = () =>
      page.evaluate(() => {
        const channels = (colour) =>
          colour
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number);
        const opaque = (colour) => {
          const alpha = colour.match(/[\d.]+/g)?.[3];
          return colour !== "transparent" && alpha !== "0";
        };
        const luminance = (rgb) => {
          const [r, g, b] = rgb.map((value) => {
            const c = value / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const contrast = (a, b) => {
          const [high, low] = [luminance(a), luminance(b)].sort(
            (x, y) => y - x,
          );
          return (high + 0.05) / (low + 0.05);
        };
        return [...document.querySelectorAll('main input[type="number"]')]
          .filter((input) => input.getClientRects().length > 0)
          .map((input) => {
            let surround = input.parentElement;
            while (!opaque(getComputedStyle(surround).backgroundColor))
              surround = surround.parentElement;
            const style = getComputedStyle(input);
            const panel = channels(getComputedStyle(surround).backgroundColor);
            const field = channels(style.backgroundColor);
            return {
              id: input.id,
              border: contrast(channels(style.borderTopColor), panel),
              borderWidth: Number.parseFloat(style.borderTopWidth),
              fieldLighter: luminance(field) >= luminance(panel),
            };
          });
      });
    const check = (inputs, screen) => {
      expect(inputs.length, screen).toBeGreaterThan(0);
      for (const { id, border, borderWidth, fieldLighter } of inputs) {
        expect(border, `${screen}: ${id}`).toBeGreaterThanOrEqual(3);
        expect(borderWidth, `${screen}: ${id}`).toBeGreaterThanOrEqual(1);
        // A light-mode field darker than its panel reads as read-only.
        if (colorScheme === "light")
          expect(fieldLighter, `${screen}: ${id}`).toBe(true);
      }
    };
    await fixture(page);
    check(await measure(), "plan");
    await page.locator("#suggest-plan-btn").click();
    await page.locator("#confirm-btn").click();
    await expect(page.locator("#allocation")).toBeVisible();
    check(await measure(), "allocation");
  });
}

test("at 390 px no label touches the control below it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Each label row (the label with any detail beside it) against the first
  // control that follows it in the document and starts below it.
  const measure = () =>
    page.evaluate(() => {
      const visible = (node) => node.getClientRects().length > 0;
      const controls = [
        ...document.querySelectorAll(
          "main :is(input, button, select, textarea, summary)",
        ),
      ].filter((node) => visible(node) && !node.closest("label.tech-row"));
      const measured = [];
      const touching = [
        ...document.querySelectorAll("main label:not(.tech-row)"),
      ]
        .filter(visible)
        .flatMap((label) => {
          const row = label.closest(".field-heading") ?? label;
          const { top, bottom } = row.getBoundingClientRect();
          const next = controls.find(
            (control) =>
              !row.contains(control) &&
              label.compareDocumentPosition(control) &
                Node.DOCUMENT_POSITION_FOLLOWING &&
              control.getBoundingClientRect().top > top,
          );
          if (!next) return [];
          measured.push(label.textContent.trim());
          const gap = next.getBoundingClientRect().top - bottom;
          return gap < 4
            ? [`${label.textContent.trim()}: ${gap.toFixed(1)} px`]
            : [];
        });
      return { measured, touching };
    });
  const production = ["Cultivate", "Fertilize", "Prepare new land"];
  const check = async (screen, labels) => {
    const { measured, touching } = await measure();
    expect(measured, screen).toEqual(expect.arrayContaining(labels));
    expect(touching, screen).toEqual([]);
  };
  await fixture(page);
  await check("Year 1 plan", production);
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  await check("allocation", ["Keep in Storage"]);
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#report")).toBeVisible();
  await expect(page.locator("#first-plan")).toBeHidden();
  await check("report and Year 2 plan", production);
});

test("the chronicle empty state hides once the first Harvest is committed", async ({
  page,
}) => {
  await fixture(page);
  const empty = page.getByText("Your first Harvest will begin the story.");
  await expect(empty).toBeVisible();
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  await expect(empty).toBeHidden();
  await page.reload();
  await expect(page.locator("#allocation")).toBeVisible();
  await expect(empty).toBeHidden();
  await page.locator("#allocate-btn").click();
  await expect(empty).toBeHidden();
  await expect(page.locator("#event-log tbody tr")).toHaveCount(1);
});
