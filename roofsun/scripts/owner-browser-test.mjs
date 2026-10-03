import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:8000";
const browser = await chromium.launch({
  channel: process.env.ROOFSUN_BROWSER_CHANNEL || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.locator(".owner-answer strong").waitFor();
  assert(
    (await page.locator(".owner-answer").innerText()).includes(
      "Sustained payback",
    ),
  );
  await page
    .getByRole("button", {
      name: "What if the forecast is optimistic?",
      exact: true,
    })
    .click();
  await page
    .locator(".owner-answer")
    .getByText(/exceeds that ceiling/)
    .waitFor();
  await page
    .getByRole("button", {
      name: "See what the evidence supports →",
      exact: true,
    })
    .click();
  await page.locator('[data-report-status="current"]').waitFor();
  assert.equal(await page.locator(".evidence-register article").count(), 6);
  await page.getByRole("button", { name: "繁中", exact: true }).click();
  assert(
    (await page.locator(".evidence-map").innerText()).includes(
      "不是你家天台的測量",
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const validation = await (
    await page.request.get(base + "/api/validation")
  ).json();
  // Explicitly synthetic failure injection: verify FAIL and stale badges, not model accuracy.
  await page.route("**/api/validation", (route) =>
    route.fulfill({
      json: {
        ...validation,
        freshness: { status: "stale", changed_files: ["synthetic-test-only"] },
        checks: [
          {
            name_en: "Synthetic failed check",
            name_zh: "合成失敗測試",
            passed: false,
            observed: "test only",
          },
          {
            name_en: "Synthetic unknown check",
            name_zh: "合成未核實測試",
            observed: "test only",
          },
        ],
      },
    }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Model & sources", exact: true })
    .click();
  await page.locator('[data-check-status="failed"]').waitFor();
  assert(
    (await page.locator('[data-check-status="failed"]').innerText()).includes(
      "FAIL",
    ),
  );
  assert.equal(await page.locator('[data-check-status="passed"]').count(), 0);
  assert.equal(await page.locator('[data-check-status="unknown"]').count(), 1);
  assert(
    (await page.locator('[data-report-status="stale"]').innerText()).includes(
      "do not establish",
    ),
  );
  await page.unroute("**/api/validation");
  await page.route("**/api/validation", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Synthetic unavailable report" },
    }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Model & sources", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Validation report unavailable" })
    .waitFor();
  assert.equal(await page.locator('[data-check-status="passed"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: owner explanations, source boundaries, bilingual/mobile, failure/unknown/stale report and unavailable-report handling",
  );
} finally {
  await browser.close();
}
