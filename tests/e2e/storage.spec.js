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

test("first visit with unavailable storage renders a paused new game and can recover", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (!window.storageRecovered) throw new Error("security");
      return original.call(this, key);
    };
  });
  await page.goto(origin);
  await expect(page.locator("#stat-year")).toHaveText("1");
  await expect(page.locator("#save-status")).toContainText("Play is paused");
  await expect(page.locator("#confirm-btn")).toBeDisabled();
  await page.evaluate(() => {
    window.storageRecovered = true;
  });
  await page.locator("#retry-save-btn").click();
  await expect(page.locator("#save-notice")).toBeHidden();
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#allocation")).toBeVisible();
  expect(errors).toEqual([]);
});

test("failed harvest save stays visible, retries once, and preserves the previous save", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (!window.storageRecovered) throw new Error("quota");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirm-btn").click();
  await expect(page.locator("#save-status")).toContainText("not saved");
  await expect(page.locator("#allocation")).toBeVisible();
  await expect(page.locator("#allocate-btn")).toBeDisabled();
  await page.locator("#retry-save-btn").click();
  await expect(page.locator("#save-status")).toContainText("not saved");
  await page.evaluate(() => {
    window.storageRecovered = true;
  });
  await page.locator("#retry-save-btn").click();
  await expect(page.locator("#allocate-btn")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#allocation")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const collapsed of [false, true]) {
  test(`failed allocation and Restart preserve a ${collapsed ? "collapsed" : "continuing"} run until retry succeeds`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(async () => {
      const { newSave, persist } = await import("/dist/persistence.js");
      persist(newSave(5));
    });
    await page.reload();
    if (collapsed) await page.locator("#plan-hectares").fill("0");
    await page.locator("#confirm-btn").click();
    const previous = await page.evaluate(() =>
      localStorage.getItem("growOrDie.save.v1"),
    );
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (!window.storageRecovered) throw new Error("quota");
        return original.call(this, key, value);
      };
    });
    // A Collapsed run keeps showing its final Year rather than the next one.
    const yearAfter = collapsed ? "1" : "2";
    await page.locator("#allocate-btn").click();
    await expect(page.locator("#stat-year")).toHaveText(yearAfter);
    await expect(page.locator("#report")).toBeVisible();
    await expect(page.locator("#event-log li")).toHaveCount(1);
    await expect(page.locator("#confirm-btn")).toBeDisabled();
    if (collapsed) {
      await expect(page.locator("#production")).toBeHidden();
      await expect(page.locator("#collapse-summary")).toBeVisible();
      await expect(page.locator("#collapse-restart-btn")).toBeDisabled();
    } else {
      await page.locator("#plan-hectares").fill("0");
      await expect(page.locator("#confirm-btn")).toBeDisabled();
    }
    expect(
      await page.evaluate(() => localStorage.getItem("growOrDie.save.v1")),
    ).toBe(previous);
    await page.evaluate(() => {
      window.storageRecovered = true;
    });
    await page.locator("#retry-save-btn").click();
    await expect(page.locator("#save-notice")).toBeHidden();
    if (collapsed)
      await expect(page.locator("#collapse-restart-btn")).toBeEnabled();
    else await expect(page.locator("#confirm-btn")).toBeEnabled();
    const completed = await page.evaluate(() =>
      localStorage.getItem("growOrDie.save.v1"),
    );
    await page.evaluate(() => {
      window.storageRecovered = false;
    });
    await page.locator("#restart-btn").click();
    await page.locator("#restart-confirm-btn").click();
    await expect(page.locator("#save-status")).toContainText(
      "Restart was not saved",
    );
    await expect(page.locator("#stat-year")).toHaveText(yearAfter);
    expect(
      await page.evaluate(() => localStorage.getItem("growOrDie.save.v1")),
    ).toBe(completed);
    await page.locator("#retry-save-btn").click();
    await expect(page.locator("#stat-year")).toHaveText(yearAfter);
    await page.evaluate(() => {
      window.storageRecovered = true;
    });
    await page.locator("#retry-save-btn").click();
    await expect(page.locator("#stat-year")).toHaveText("1");
    await expect(page.locator("#event-log li")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#stat-year")).toHaveText("1");
    expect(errors).toEqual([]);
  });
}

for (const failure of ["getItem", "localStorage"]) {
  test(`startup handles throwing ${failure} and retries without overwriting an existing run`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator("#confirm-btn").click();
    const previous = await page.evaluate(() =>
      localStorage.getItem("growOrDie.save.v1"),
    );
    await page.addInitScript((failure) => {
      if (failure === "getItem") {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          if (!window.storageRecovered) throw new Error("security");
          return original.call(this, key);
        };
      } else {
        const storage = window.localStorage;
        Object.defineProperty(window, "localStorage", {
          get() {
            if (!window.storageRecovered) throw new Error("security");
            return storage;
          },
        });
      }
    }, failure);
    await page.reload();
    await expect(page.locator("#save-status")).toContainText("Could not read");
    await expect(page.locator("#confirm-btn")).toBeDisabled();
    await page.locator("#retry-save-btn").click();
    await expect(page.locator("#save-status")).toContainText("Could not read");
    await page.evaluate(() => {
      window.storageRecovered = true;
    });
    await page.locator("#retry-save-btn").click();
    await expect(page.locator("#allocation")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("growOrDie.save.v1")),
    ).toBe(previous);
    expect(errors).toEqual([]);
  });
}
