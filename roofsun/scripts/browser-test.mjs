import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
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
    { timeout: 30000 },
  );
const searched = () =>
  page.waitForFunction(
    () => !document.querySelector(".search-status")?.textContent.includes("…"),
    {},
    { timeout: 30000 },
  );
const recommendationReady = () =>
  page.waitForFunction(
    () => {
      const b = document.querySelector(".recommendation");
      return b && !b.disabled;
    },
    {},
    { timeout: 30000 },
  );
const reset = async () => {
  await page
    .getByRole("button", { name: "Reset all inputs", exact: true })
    .click();
  await ready();
  await recommendationReady();
};
try {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      assert(r.ok);
      await page.goto(base);
      break;
    } catch (e) {
      if (i === 29) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await ready();
  await recommendationReady();
  const baseline = await (
    await fetch(`${base}/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).json();
  assert.equal(
    (await page.locator(".hero-number").innerText()).replace(/\D/g, ""),
    String(Math.round(baseline.annual_kwh)),
  );
  assert(
    (await page.locator(".decision-banner").innerText()).includes(
      "Example rooftop",
    ),
  );
  assert(
    await page
      .getByText("More panels. What do you give up?", { exact: true })
      .isVisible(),
  );
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Advanced mode", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save this pair as A/B", exact: true })
    .click();
  assert.equal(await page.locator(".saved-plan").count(), 2);
  await page.reload();
  await ready();
  assert.equal(await page.locator(".saved-plan").count(), 2);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("/tmp/roofsun-browser-checks/plans.json");
  const archive = JSON.parse(
    await readFile("/tmp/roofsun-browser-checks/plans.json", "utf8"),
  );
  assert.equal(archive.schema, "roofsun-hk/v2");
  assert.equal(archive.model_version, "2.1.0");
  assert.equal(Object.keys(archive.weather_sources).length, 3);
  // Imported result numbers must be discarded and recomputed from validated inputs.
  archive.plans.forEach((p) => (p.annual_kwh = 99999999));
  await page.getByLabel("Import design file", { exact: true }).setInputFiles({
    name: "plans.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await page
    .getByRole("button", { name: "Import JSON", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".saved-plan").length === 2 &&
      !document
        .querySelector(".saved-grid")
        ?.textContent.includes("99,999,999"),
  );
  await ready();
  assert(
    !(await page.locator(".saved-grid").innerText()).includes("99,999,999"),
  );
  const reportPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download report", exact: true })
    .click();
  const report = await reportPromise;
  await report.saveAs("/tmp/roofsun-browser-checks/report.html");
  assert(
    (
      await readFile("/tmp/roofsun-browser-checks/report.html", "utf8")
    ).includes("csv_sha256"),
  );
  await page.getByLabel("Import design file", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"schema":"roofsun-hk/v2","plans":[{"inputs":{"width":-1},"config":{"rows":2}}]}',
    ),
  });
  await page
    .getByText("Imported inputs failed model validation / 輸入未通過模型驗證", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".saved-plan").count(), 2);
  // Budget refusal must be visible while physical exploration remains available.
  await page.getByLabel("Limit installation budget", { exact: true }).check();
  await page.getByLabel("Budget cap", { exact: true }).fill("1000");
  await ready();
  await searched();
  await page
    .getByRole("heading", {
      name: "Consider deferring installation",
      exact: true,
    })
    .waitFor();
  assert(await page.locator(".recommendation").first().isDisabled());
  await page.getByLabel("Limit installation budget", { exact: true }).uncheck();
  await ready();
  await recommendationReady();
  await page.getByLabel("Width", { exact: true }).fill("20");
  await page
    .getByText(/Available roof area exceeds the house covered area/)
    .waitFor();
  assert.equal(
    await page.getByLabel("House covered area", { exact: true }).inputValue(),
    "80",
  );
  await page.getByLabel("Width", { exact: true }).fill("8");
  await ready();
  await page.locator(".advanced-finance").first().locator("summary").click();
  await page
    .getByLabel("Commissioning date", { exact: true })
    .fill("2032-01-01");
  await ready();
  await searched();
  await page
    .getByRole("heading", {
      name: "Consider deferring installation",
      exact: true,
    })
    .waitFor();
  await page
    .getByLabel("Require positive net cash flow and NPV", { exact: true })
    .uncheck();
  await page
    .getByLabel("Limit sustained payback time", { exact: true })
    .uncheck();
  await ready();
  await recommendationReady();
  await reset();
  await page.getByRole("button", { name: /Balanced choice/ }).click();
  await ready();
  assert.notEqual(
    (await page.locator(".hero-number").innerText()).replace(/\D/g, ""),
    String(Math.round(baseline.annual_kwh)),
  );
  await page.locator('.recharts-symbols[fill="#2c5d42"]').first().click();
  await ready();
  await page
    .getByLabel("Rooftop scenario", { exact: true })
    .selectOption("shaded");
  await ready();
  await searched();
  assert.notEqual(
    (await page.locator(".hero-number").innerText()).replace(/\D/g, ""),
    String(Math.round(baseline.annual_kwh)),
  );
  await page
    .getByRole("slider", { name: "Panel tilt", exact: true })
    .fill("35");
  await ready();
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await page
    .getByRole("slider", { name: "Time of day", exact: true })
    .fill("7");
  await page.getByLabel("Include self-use after 2033", { exact: true }).check();
  await ready();
  assert(
    await page.getByText("Avoided tariff HK$/kWh", { exact: true }).isVisible(),
  );
  await reset();
  await page
    .getByRole("button", {
      name: "Run sensitivity & reference checks",
      exact: true,
    })
    .click();
  await page
    .getByRole("heading", {
      name: "Whole-generation reference comparison",
      exact: true,
    })
    .waitFor({ timeout: 60000 });
  assert(await page.getByText("2024 ·", { exact: false }).isVisible());
  const evidenceExport = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const ed = await evidenceExport;
  await ed.saveAs("/tmp/roofsun-browser-checks/evidence.json");
  assert(
    JSON.parse(
      await readFile("/tmp/roofsun-browser-checks/evidence.json", "utf8"),
    ).evidence.reference.reference_kwh > 0,
  );
  await page.getByLabel("Installation per kW", { exact: true }).fill("18000");
  await ready();
  await page.getByText(/Inputs changed. Run the analysis again/).waitFor();
  const staleExport = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const sd = await staleExport;
  await sd.saveAs("/tmp/roofsun-browser-checks/stale.json");
  assert.equal(
    JSON.parse(await readFile("/tmp/roofsun-browser-checks/stale.json", "utf8"))
      .evidence,
    null,
  );
  await page.locator(".engineering-controls summary").click();
  await page
    .getByLabel("Reference weather year", { exact: true })
    .selectOption("2024");
  await ready();
  await page
    .getByLabel("Electrical shading assumption", { exact: true })
    .selectOption("martinez");
  await ready();
  await page
    .getByRole("button", { name: "Add rooftop object", exact: true })
    .click();
  await ready();
  assert(await page.getByLabel("Object 1 height", { exact: true }).isVisible());
  await page
    .getByLabel("Additional mass / module", { exact: true })
    .fill("400");
  await ready();
  await page
    .getByText("Estimated module, rack and added load exceeds the limit", {
      exact: true,
    })
    .waitFor();
  await reset();
  // Audit regressions exercised through the real UI, not API-only fixtures.
  await page.getByRole("button", { name: "Simple mode", exact: true }).click();
  assert.equal(
    await page.getByLabel("Installation per kW", { exact: true }).inputValue(),
    "25000",
  );
  assert(
    await page
      .getByRole("heading", {
        name: "Highest acceptable installation quote",
        exact: true,
      })
      .isVisible(),
  );
  assert(
    !(await page
      .getByRole("heading", {
        name: "Generation through the year",
        exact: true,
      })
      .isVisible()),
  );
  assert(
    await page
      .getByRole("heading", {
        name: "Independent weather-input check",
        exact: true,
      })
      .isVisible(),
  );
  await page.getByLabel("Floors above your rooftop", { exact: true }).fill("1");
  await page.getByLabel("Distance to neighbour", { exact: true }).fill("10");
  const shadingResponse = page.waitForResponse(
    (r) => r.url().includes("/api/evaluate") && r.status() === 200,
  );
  await page
    .getByRole("button", { name: "Apply neighbour shading", exact: true })
    .click();
  const withNeighbour = await (await shadingResponse).json();
  assert(withNeighbour.annual_kwh < baseline.annual_kwh);
  await reset();
  const massResponse = page.waitForResponse(
    (r) => r.url().includes("/api/evaluate") && r.status() === 200,
  );
  await page
    .getByLabel("Mounting weight preset", { exact: true })
    .selectOption("ballast");
  const ballasted = await (await massResponse).json();
  assert(ballasted.load_kg_m2 > baseline.load_kg_m2);
  await reset();
  await page.getByLabel("House covered area", { exact: true }).fill("200");
  await page.getByLabel("Width", { exact: true }).fill("12");
  await page.getByLabel("Depth", { exact: true }).fill("10");
  await ready();
  const cappedResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/evaluate") &&
      r.status() === 200 &&
      r.request().postDataJSON()?.config?.panel_limit === 22,
  );
  await page
    .getByRole("button", { name: "Cap at 22 modules / 9.9 kW", exact: true })
    .click();
  const capped = await (await cappedResponse).json();
  assert.equal(capped.panels_count, 22);
  assert.equal(capped.capacity_kw, 9.9);
  assert.equal(capped.fit_rate, 4);
  await ready();
  const cliffResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/evaluate") &&
      r.status() === 200 &&
      r.request().postDataJSON()?.config?.panel_limit === 23,
  );
  await page.getByLabel("Maximum modules", { exact: true }).fill("23");
  const cliff = await (await cliffResponse).json();
  assert.equal(cliff.capacity_kw, 10.35);
  assert.equal(cliff.fit_rate, 3);
  assert(cliff.npv_A < capped.npv_A);
  await ready();
  await recommendationReady();
  await page.getByRole("button", { name: /Best within 10 kW/ }).click();
  await ready();
  await page
    .locator(".quote-screen")
    .getByText(/22 modules · 9.9 kW/)
    .waitFor();
  await reset();
  await page.locator(".measured-reference summary").click();
  await page
    .getByLabel("Meter generation kWh", { exact: true })
    .fill(String(baseline.monthly_kwh.reduce((a, b) => a + b, 0)));
  await page
    .getByLabel("Actual installed capacity kW", { exact: true })
    .fill(String(baseline.capacity_kw));
  await page
    .getByLabel("Record source / period", { exact: true })
    .fill("Synthetic browser fixture; not field evidence");
  await page
    .getByRole("button", { name: "Compare meter record", exact: true })
    .click();
  await page
    .locator(".measured-reference")
    .getByText(/relative difference 0%/)
    .waitFor();
  const meterExport = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const meterFile = await meterExport;
  await meterFile.saveAs("/tmp/roofsun-browser-checks/meter.json");
  const meterArchive = JSON.parse(
    await readFile("/tmp/roofsun-browser-checks/meter.json", "utf8"),
  );
  assert.equal(meterArchive.measured_reference.difference_pct, 0);
  assert.equal(
    meterArchive.irradiance_checks["2025"].same_year.difference_pct,
    3,
  );
  await page
    .getByRole("slider", { name: "Panel tilt", exact: true })
    .fill("35");
  await ready();
  await page
    .locator(".measured-reference")
    .getByText("Inputs changed; rerun this comparison.", { exact: true })
    .waitFor();
  const changedMeter = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const changedFile = await changedMeter;
  await changedFile.saveAs("/tmp/roofsun-browser-checks/meter-stale.json");
  assert.equal(
    JSON.parse(
      await readFile("/tmp/roofsun-browser-checks/meter-stale.json", "utf8"),
    ).measured_reference,
    null,
  );
  await reset();
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/screening-desktop.png",
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Advanced mode", exact: true })
    .click();
  await page.getByRole("button", { name: "繁中", exact: true }).click();
  assert(
    await page
      .getByRole("heading", {
        name: "示例天台：請改為你的實際資料",
        exact: true,
      })
      .isVisible(),
  );
  await page.getByRole("button", { name: "模型與來源", exact: true }).click();
  await page.getByText("已發表太陽位置基準", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "完整發電流程參考核對", exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/validation-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "設計工作台", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
    {},
    { timeout: 10000 },
  );
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/mobile-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("1");
  await page.getByLabel("Depth", { exact: true }).fill("1");
  await ready();
  assert((await page.locator(".hero-number").innerText()).startsWith("0"));
  await page
    .getByText("Not enough room for a module", { exact: true })
    .waitFor();
  await searched();
  assert(await page.locator(".recommendation").first().isDisabled());
  await page.route("**/api/evaluate*", (route) => route.abort());
  await page.getByLabel("Width", { exact: true }).fill("8");
  await page
    .locator('.error-banner[role="alert"]')
    .filter({ hasText: "Could not calculate" })
    .waitFor();
  assert((await page.locator(".hero-number").innerText()).includes("—"));
  await page.unroute("**/api/evaluate*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready();
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  console.log(
    "PASS: audit packing/9.9 kW tariff cap, conservative quote screen, neighbour geometry, ballast, actual-meter workflow and stale-meter exports; goals/refusal, physical trade-off, persisted A/B, safe recalculated imports, JSON/report provenance, sensitivity/reference and stale-evidence exclusion, weather/mass/obstacles/electrical inputs, bilingual evidence, charts, mobile, invalid area, no-space and network retry.",
  );
} catch (error) {
  await page.screenshot({
    path: "/tmp/roofsun-browser-checks/failure.png",
    fullPage: true,
  });
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await browser.close();
}
