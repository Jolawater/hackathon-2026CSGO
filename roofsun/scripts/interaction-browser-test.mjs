import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  channel: process.env.ROOFSUN_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [],
  requests = [];
page.on("response", async (r) => {
  if (r.url().includes("/api/sun-track") && r.status() === 200)
    await page
      .evaluate(() => (window.__roofsunTrackReady = true))
      .catch(() => {});
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/api/evaluate")) requests.push(r.postDataJSON());
});
const button = (name) => page.getByRole("button", { name, exact: true });
const confirm = async () => {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/evaluate") && r.status() === 200,
  );
  await button("Confirm and keep").click();
  return (await response).json();
};
const ready = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".hero-number") &&
      !document.querySelector(".hero-number").textContent.includes("—"),
    {},
    { timeout: 60000 },
  );
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const health = await fetch(base + "/api/health");
      if (health.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await page.goto(base);
  await button("Try an example first").waitFor();
  assert.equal(
    requests.length,
    0,
    "No personal prediction before explicit entry",
  );
  await button("Try an example first").click();
  await ready();
  await page.locator(".scene3d-canvas canvas").waitFor();
  await page.waitForFunction(
    () => window.__roofsunTrackReady === true,
    {},
    { timeout: 15000 },
  );
  const timeline = page.getByRole("slider", {
    name: "Time of day",
    exact: true,
  });
  const setTime = async (value) =>
    timeline.evaluate((el, value) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(el, String(value));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  const trackedCanvas = page.locator(".scene3d-canvas canvas");
  await trackedCanvas.evaluate((el) => (el.dataset.retained = "yes"));
  const daytime = await trackedCanvas.screenshot();
  const countBeforeTime = requests.length;
  await setTime(0);
  await page.waitForTimeout(200);
  const night = await trackedCanvas.screenshot();
  assert(!daytime.equals(night));
  assert.equal(requests.length, countBeforeTime);
  assert.equal(await trackedCanvas.getAttribute("data-retained"), "yes");
  await setTime(12);
  await button("Play day").click();
  await page.waitForTimeout(300);
  await button("Pause").click();
  assert.notEqual(Number(await timeline.inputValue()), 12);
  await setTime(12);
  const initial = await page.locator(".hero-number").innerText();
  const stored = await page.evaluate(() =>
    localStorage.getItem("roofsun-workspace-v2"),
  );
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  // Discover the existing label without relying on translated prose.
  const roofWidth = (await width.count())
    ? width
    : page.locator(".roof-inputs input[type=number]").first();
  const input = page.locator('input[aria-label="Width (m)"]');
  const field = (await roofWidth.count()) ? roofWidth : input;
  // The first number input in the roof card is the roof width.
  const widthField = (await field.count())
    ? field
    : page.locator(".input-card input[type=number]").first();
  const editable = (await widthField.count())
    ? widthField
    : page.getByRole("spinbutton").filter({ visible: true }).first();
  const before = await editable.inputValue();
  await editable.fill(String(Number(before) + 0.1));
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".hero-number").innerText(), initial);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("roofsun-workspace-v2")),
    stored,
  );
  await button("Cancel changes").click();
  assert.equal(await editable.inputValue(), before);
  await page.route("**/api/evaluate*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await editable.fill(String(Number(before) - 0.1));
  const confirmation = confirm();
  await page.waitForTimeout(350);
  assert.equal(
    await page.locator(".scene3d-canvas canvas").getAttribute("data-retained"),
    "yes",
    "old scene stays alive while calculation runs",
  );
  await confirmation;
  await page.unroute("**/api/evaluate*");
  await ready();
  assert.notEqual(
    await page.evaluate(() => localStorage.getItem("roofsun-workspace-v2")),
    stored,
  );
  await button("Advanced mode").click();
  const years = page.getByRole("spinbutton", {
    name: "How many years should we compare?",
    exact: true,
  });
  await years.fill("5");
  const short = await confirm();
  assert.equal(short.analysis_years, 5);
  assert(short.cashflow.at(-1).date.startsWith("2031"));
  await years.fill("25");
  await confirm();
  const month = page.getByRole("combobox", {
    name: "Preview month",
    exact: true,
  });
  assert.equal(await month.locator("option").count(), 12);
  await month.selectOption("2025-06-15");
  await button("Confirm and keep").click();
  await page
    .getByRole("spinbutton", { name: "Move array left / right", exact: true })
    .fill("25");
  const invalid = await confirm();
  assert(invalid.violations.includes("placement_invalid"));
  await button("Reset placement").click();
  await confirm();
  await ready();
  // Same winning result for every objective must produce one card with several badges.
  const response = await page.request.post(base + "/api/simulate", {
    data: requests.at(-1).inputs,
    timeout: 120000,
  });
  const search = await response.json();
  const winner = Object.values(search.recommendations)[0];
  assert(winner);
  await page.route("**/api/simulate*", (route) =>
    route.fulfill({
      json: {
        ...search,
        recommendations: {
          npv: winner,
          payback: winner,
          under10: winner,
          economy: winner,
          balanced: winner,
          generation: winner,
        },
      },
    }),
  );
  await page.reload();
  await ready();
  await page.waitForFunction(
    () => document.querySelectorAll(".recommendation").length === 1,
  );
  assert.equal(await page.locator(".choice-badges span").count(), 6);
  await page.unroute("**/api/simulate*");
  const canvas = page.locator(".scene3d-canvas canvas"),
    bounds = await canvas.boundingBox();
  const shot1 = await canvas.screenshot();
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + 250, {
    steps: 12,
  });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const shot2 = await canvas.screenshot();
  assert(!shot1.equals(shot2), "Orbit drag changes rendered viewpoint");
  const save = page.getByRole("button", { name: /Save.*comparison/i }).first();
  if (await save.count()) await save.click();
  const artifacts =
    process.env.ROOFSUN_ARTIFACTS || join(tmpdir(), "roofsun-interaction");
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: join(artifacts, "desktop.png"),
    fullPage: true,
  });
  await page
    .locator(".scene3d")
    .screenshot({ path: join(artifacts, "scene.png") });
  await button("繁中").click();
  assert(
    (await page.locator(".confirmation-bar").innerText()).includes(
      "確認並保留",
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: join(artifacts, "mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await button("返回開始").click();
  assert(await button("分析我的天台").isVisible());
  assert.deepEqual(errors, []);
  console.log(
    "PASS: explicit entry, draft/cancel/confirm/storage, period, month, invalid placement, deduplicated recommendations, 3D orbit, bilingual/mobile",
  );
} finally {
  await browser.close();
}
