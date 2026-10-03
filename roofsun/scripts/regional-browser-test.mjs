import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:8766";
const browser = await chromium.launch({
  channel: process.env.ROOFSUN_BROWSER_CHANNEL || "msedge",
});
try {
  for (const region of ["shenzhen", "london"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const button = (name) => page.getByRole("button", { name, exact: true });
    await page.goto(base);
    await button("Use my rooftop").click();
    await page.getByLabel("City", { exact: true }).selectOption(region);
    for (let i = 0; i < 4; i++) await button("Next").click();
    await page.getByRole("checkbox").check();
    await button("Next").click();
    await button("Confirm and view my options").click();
    await page.locator(".regional-lab").waitFor();
    await page
      .getByLabel("Price of grid electricity", { exact: true })
      .fill(".3");
    await page
      .getByLabel("Price paid for exported electricity", { exact: true })
      .fill(".1");
    await page
      .getByLabel("Desired payback years (0 = no cap)", { exact: true })
      .fill("0");
    await page.waitForTimeout(1500);
    await button("Confirm and keep").click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".plan-brief")
          .textContent.includes("Comparing…"),
      {},
      { timeout: 120000 },
    );
    assert(
      !(await page.locator(".plan-brief").innerText()).includes("undefined"),
    );
    const key = "roofsun-region-" + region,
      saved = await page.evaluate((key) => localStorage.getItem(key), key);
    assert(saved);
    await page.getByLabel("Panel tilt", { exact: true }).fill("30");
    await page.waitForTimeout(1000);
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), key),
      saved,
    );
    await button("Cancel changes").click();
    assert.equal(
      await page.getByLabel("Panel tilt", { exact: true }).inputValue(),
      "20",
    );
    await page.reload();
    await page.locator(".regional-lab").waitFor();
    assert.equal(
      await page
        .getByLabel("Price of grid electricity", { exact: true })
        .inputValue(),
      "0.3",
    );
    await page.locator(".plan-management > summary").click();
    const download = page.waitForEvent("download");
    await button("Download plan backup").click();
    assert((await download).suggestedFilename().includes(region));
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "PASS: Shenzhen/London wizard, local tariffs, save/cancel/reload, backup, mobile",
  );
} finally {
  await browser.close();
}
