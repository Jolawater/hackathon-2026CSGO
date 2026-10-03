import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { annualBalances, elapsedMonths } from "../src/lib/payback.js";
assert.equal(elapsedMonths("2027-01-01", "2027-09-30"), 9);
assert.equal(elapsedMonths("2027-01-01", null), null);
const sample = {
  analysis_years: 2,
  cashflow: [
    { date: "2027-01-01", A: -100 },
    { date: "2027-12-31", A: 20 },
    { date: "2028-01-31", A: -30 },
    { date: "2028-12-31", A: -10 },
  ],
};
assert.deepEqual(
  annualBalances(sample).map((r) => r.balance),
  [-100, 20, -10],
);
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8766/");
  await page
    .getByRole("button", { name: "Try an example first", exact: true })
    .click();
  const chart = page.locator(".annual-payback");
  await chart.locator(".payback-summary").waitFor({ timeout: 60000 });
  assert.equal(await chart.locator(".recharts-bar-rectangle").count(), 26);
  await chart.locator("summary").click();
  assert.equal(await chart.locator("tbody tr").count(), 26);
  const labels = page.getByLabel("Payback chart layout", { exact: true });
  await page.waitForFunction(
    () => document.querySelector(".annual-payback select").options.length > 1,
    {},
    { timeout: 120000 },
  );
  await labels.selectOption({ index: 1 });
  await chart.locator(".payback-summary").waitFor();
  assert(!(await chart.innerText()).includes("NaN"));
  await chart.screenshot({
    path: "E:/hackathon/roofsun-ui-review/payback-desktop.png",
  });
  await page.getByRole("button", { name: "繁中", exact: true }).click();
  assert((await chart.innerText()).includes("收支持平"));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await chart.screenshot({
    path: "E:/hackathon/roofsun-ui-review/payback-mobile.png",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: duration, annual cumulative balances, current/recommended layouts, bilingual/mobile chart",
  );
} finally {
  await browser.close();
}
