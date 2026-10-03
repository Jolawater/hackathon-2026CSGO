import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:8766";
const browser = await chromium.launch({
  channel: process.env.ROOFSUN_BROWSER_CHANNEL || "msedge",
});
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    requests = [];
  page.on("request", (r) => {
    if (r.url().includes("preview=1")) requests.push(r.postDataJSON());
  });
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(base);
  await button("Try an example first").click();
  const canvas = page.locator(".scene3d-canvas canvas");
  await canvas.waitFor();
  await page.waitForTimeout(1700);
  await canvas.scrollIntoViewIfNeeded();
  async function scan() {
    const b = await canvas.boundingBox(),
      found = {};
    for (let y = 0.25; y < 0.78; y += 0.075)
      for (let x = 0.25; x < 0.78; x += 0.075) {
        await page.mouse.move(b.x + b.width * x, b.y + b.height * y);
        await page.waitForTimeout(15);
        const tip = page.locator(".scene-dimension-tooltip");
        if (await tip.isVisible()) {
          const text = await tip.innerText();
          const type = text.startsWith("One panel") ? "panel" : "roof";
          found[type] = { x: b.x + b.width * x, y: b.y + b.height * y };
        }
        if (found.panel && found.roof) return found;
      }
    return found;
  }
  const found = await scan();
  assert(
    found.roof && found.panel,
    "Both roof and panel dimensions available on hover",
  );
  await page.mouse.move(0, 0);
  assert(!(await page.locator(".scene-dimension-tooltip").isVisible()));
  const stored = await page.evaluate(() =>
    localStorage.getItem("roofsun-workspace-v2"),
  );
  await button("Rotate panels").click();
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.35, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.notEqual(requests.at(-1).config.azimuth, 180);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("roofsun-workspace-v2")),
    stored,
  );
  await button("Cancel changes").click();
  await button("Finish rotating").click();
  await page.waitForTimeout(1000);
  await button("Place panels").click();
  await page
    .getByLabel("Placement type", { exact: true })
    .selectOption("single");
  await canvas.scrollIntoViewIfNeeded();
  const p = found.panel;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 4, p.y + 3, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert(
    Array.isArray(requests.at(-1).config.manual_panels),
    "Single panel drag enters explicit placement mode",
  );
  await button("Cancel changes").click();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("roofsun-workspace-v2")),
    stored,
  );
  console.log(
    "PASS: hover dimensions, direct rotation and individual placement preview, cancel preserves storage",
  );
} finally {
  await browser.close();
}
