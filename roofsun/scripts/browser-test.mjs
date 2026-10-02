import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir("/tmp/roofsun-browser-checks", { recursive: true });
const ready = () =>
  page.waitForFunction(
    () => {
      const n = document.querySelector(".hero-number");
      return n && !n.textContent.includes("—");
    },
    {},
    { timeout: 20000 },
  );
const recommendReady = () =>
  page.waitForFunction(
    () => {
      const button = document.querySelector(".recommendation");
      return button && !button.disabled;
    },
    {},
    { timeout: 20000 },
  );
try {
  for (let i = 0; i < 30; i++) {
    try {
      const health = await fetch(`${base}/api/health`);
      if (!health.ok) throw Error("API is still starting");
      await page.goto(base);
      break;
    } catch (e) {
      if (i === 29) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await ready();
  await recommendReady();
  const initial = await page.locator(".hero-number").innerText();
  assert(
    initial.includes("9,867"),
    "Baseline must display the calculated annual result",
  );
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save for comparison", exact: true })
    .click();
  await page.getByRole("button", { name: /Balanced choice/ }).click();
  await ready();
  assert.notEqual(
    await page.locator(".hero-number").innerText(),
    initial,
    "Recommendation must change the design",
  );
  await page
    .getByRole("button", { name: "Save for comparison", exact: true })
    .click();
  assert.equal(await page.locator(".saved-plan").count(), 2);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "roofsun-plans.json");
  await page.locator('.recharts-symbols[fill="#2c5d42"]').nth(1).click();
  await ready();
  assert.equal(await page.locator('#rows').inputValue(), '1');
  await page
    .getByLabel("Rooftop scenario", { exact: true })
    .selectOption("shaded");
  await ready();
  await recommendReady();
  assert.notEqual(
    await page.locator(".hero-number").innerText(),
    initial,
    "Shading scenario must change generation",
  );
  await page
    .getByRole("slider", { name: "Panel tilt", exact: true })
    .fill("35");
  await ready();
  assert.equal(await page.locator("#tilt").inputValue(), "35");
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await page
    .getByRole("slider", { name: "Time of day", exact: true })
    .fill("7");
  await page.getByLabel("Include self-use after 2033", { exact: true }).check();
  await ready();
  assert(
    await page.getByText("Avoided tariff HK$/kWh", { exact: true }).isVisible(),
  );
  await page.getByRole("button", { name: "繁中", exact: true }).click();
  assert(
    await page
      .getByRole("heading", { name: "找出更合適的太陽能擺法。" })
      .isVisible(),
  );
  await page.getByRole("button", { name: "模型與來源", exact: true }).click();
  await page.getByText("已發表太陽位置基準", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/validation-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "設計工作台", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/mobile-zh.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "Mobile layout must not overflow horizontally",
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("1");
  await page.getByLabel("Depth", { exact: true }).fill("1");
  await ready();
  assert((await page.locator(".hero-number").innerText()).startsWith("0"));
  assert(
    await page
      .getByText("Not enough room for a module", { exact: true })
      .isVisible(),
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".search-status")
      ?.textContent.includes("0 feasible"),
  );
  // Network failures must remove stale result numbers and expose a retry action.
  await page.route("**/api/evaluate*", (route) => route.abort());
  await page.getByLabel("Width", { exact: true }).fill("8");
  await page.getByRole("alert").waitFor({ timeout: 20000 });
  assert((await page.locator(".hero-number").innerText()).includes("—"));
  await page.unroute("**/api/evaluate*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready();
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  console.log(
    "PASS: baseline, recommendations, saved A/B, JSON export, shading, sliders, views, self-use, bilingual navigation, validation, mobile width, no-space handling, failed-request/retry handling.",
  );
} finally {
  await browser.close();
}
