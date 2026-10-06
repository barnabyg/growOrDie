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

// Visible containers with their own background, each listed with any tinted
// ancestor inside <main>. Bars, swatches and form controls are not containers.
const nestedTints = (page) =>
  page.evaluate(() => {
    const tinted = (node) => {
      const colour = getComputedStyle(node).backgroundColor;
      const alpha = colour.match(/[\d.]+/g)?.[3];
      return colour !== "transparent" && alpha !== "0";
    };
    const containers = [
      ...document.querySelectorAll(
        "main :is(div, section, p, label, dl, ul, li, table, details, aside)",
      ),
    ].filter(
      (node) =>
        node.getClientRects().length > 0 &&
        !node.closest(".meter, svg") &&
        tinted(node),
    );
    const name = (node) =>
      `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${[
        ...node.classList,
      ]
        .map((c) => `.${c}`)
        .join("")}`;
    const nested = [];
    for (const node of containers) {
      for (
        let parent = node.parentElement;
        parent && parent.tagName !== "MAIN";
        parent = parent.parentElement
      ) {
        if (tinted(parent)) nested.push(`${name(node)} in ${name(parent)}`);
      }
    }
    return nested;
  });

for (const colorScheme of ["light", "dark"]) {
  test(`no tinted container is nested inside another in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    // An owned Technology and an imminent doubling cover every card state
    // and the Milestone banner.
    await fixture(page, {
      state: {
        population: 1950,
        highestPopulation: 1950,
        preparedLandHectares: 2000,
        budgetCoins: 20000,
        ownedTechnologies: ["granary"],
      },
    });
    await page.locator("#tech-irrigation").check();
    await page.getByText("Weather scenarios", { exact: true }).click();
    expect(await nestedTints(page), "plan").toEqual([]);
    await page.locator("#confirm-btn").click();
    await expect(page.locator("#allocation")).toBeVisible();
    expect(await nestedTints(page), "allocation").toEqual([]);
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#milestone-banner")).toBeVisible();
    await page.getByText("Harvest, Event & Budget details").click();
    expect(await nestedTints(page), "report").toEqual([]);
    await fixture(page);
    await page.locator("#plan-hectares").fill("0");
    await page.locator("#confirm-btn").click();
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#collapse-summary")).toBeVisible();
    expect(await nestedTints(page), "Collapse").toEqual([]);
  });
}

test("headings carry no eyebrow labels that repeat them", async ({ page }) => {
  await fixture(page);
  const eyebrows = [
    "Production & investment",
    "Plan preview",
    "Latest Harvest",
    "Actual outcome",
    "Year complete",
    "Your run has ended",
  ];
  const check = async (screen) => {
    await expect(page.locator(".eyebrow"), screen).toHaveCount(0);
    for (const eyebrow of eyebrows)
      await expect(
        page.locator("main").getByText(eyebrow, { exact: true }),
        `${screen}: ${eyebrow}`,
      ).toHaveCount(0);
  };
  await check("plan");
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await check("allocation");
  await page.locator("#allocate-btn").click();
  await check("report");
  await fixture(page);
  await page.locator("#plan-hectares").fill("0");
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#collapse-summary")).toBeVisible();
  await check("Collapse");
});

test("each panel has at most one helper line and How to play holds the explanations", async ({
  page,
}) => {
  await fixture(page);
  const panels = "main > section, main > .content > section";
  const check = async (screen) => {
    const counts = await page.locator(panels).evaluateAll((nodes) =>
      nodes
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => ({
          panel: node.id || node.className,
          // The allocation range and retained-food lines are helper lines
          // whatever their class.
          helpers: [
            ...node.querySelectorAll(
              ".helper, #plan-store-range, #allocation-retained",
            ),
          ].filter((helper) => helper.getClientRects().length > 0).length,
        })),
    );
    for (const { panel, helpers } of counts)
      expect(helpers, `${screen}: ${panel}`).toBeLessThanOrEqual(1);
  };
  const moved = [
    /Invest in your country's future/,
    /Includes mandatory upkeep/,
    /Only the remaining new Harvest is exported/,
    /reloading resumes this decision/,
    /The Event is unknown until you resolve/,
    /Feed your people before growing your country/,
    /buffers future shortfalls/,
  ];
  const absent = async (screen) => {
    for (const text of moved)
      await expect(
        page.locator("main").getByText(text),
        `${screen}: ${text}`,
      ).toHaveCount(0);
  };
  await check("plan");
  await absent("plan");
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await check("allocation");
  await absent("allocation");
  await page.locator("#allocate-btn").click();
  await check("report");

  const help = page.locator("footer.help details");
  await help.locator("summary").click();
  for (const text of [
    /fertiliz/i,
    /Event is rolled when you resolve/,
    /Technologies are one-off purchases/,
    /landmarks/,
    /mandatory upkeep/i,
    /Only new Harvest can be exported/,
    /Export\s+income funds future investment/,
    /Reloading resumes/,
  ])
    await expect(help, String(text)).toContainText(text);
});

test("on mobile in Year 2 no label butts against the Cultivate field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.locator("#suggest-plan-btn").click();
  await page.locator("#confirm-btn").click();
  await page.locator("#allocate-btn").click();
  await expect(page.locator("#stat-year")).toHaveText("2");
  await expect(page.locator("#first-plan")).toBeHidden();
  // The nearest visible text above the Cultivate label leaves clear space.
  const gap = await page.evaluate(() => {
    const label = document.querySelector('label[for="plan-hectares"]');
    const top = label.getBoundingClientRect().top;
    const above = [...document.querySelectorAll("#production *")]
      .filter(
        (node) =>
          node.getClientRects().length > 0 &&
          !node.contains(label) &&
          [...node.childNodes].some(
            (child) => child.nodeType === 3 && child.textContent.trim(),
          ),
      )
      .map((node) => node.getBoundingClientRect().bottom)
      .filter((bottom) => bottom <= top + 1);
    return top - Math.max(...above);
  });
  expect(gap).toBeGreaterThanOrEqual(12);
});
