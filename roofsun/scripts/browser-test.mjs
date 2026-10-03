import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:8000";
const output = "/tmp/roofsun-browser-checks";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ready = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".results-column")?.getAttribute("aria-busy") ===
        "false" && !document.querySelector('.results-column [role="alert"]'),
    {},
    { timeout: 60000 },
  );
const label = (name) => page.getByLabel(name, { exact: true });
const button = (name) => page.getByRole("button", { name, exact: true });
async function change(action, predicate = () => true) {
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/screen") &&
      r.status() === 200 &&
      predicate(r.request().postDataJSON()),
    { timeout: 60000 },
  );
  await action();
  const result = await (await response).json();
  await ready();
  return result;
}
async function reset() {
  return change(
    () => button("Reset example").click(),
    (r) =>
      r.inputs.price_per_kw === 25000 &&
      r.inputs.door_direction === 0 &&
      r.selected_rows === null,
  );
}
async function download(name, file) {
  const promise = page.waitForEvent("download");
  await button(name).click();
  await (await promise).saveAs(`${output}/${file}`);
  return readFile(`${output}/${file}`, "utf8");
}
const ownerKeys = [
  "roof",
  "door_direction",
  "neighbour",
  "price_per_kw",
  "cost_band",
  "commissioning_month",
  "post_fit",
].sort();
try {
  for (let i = 0; i < 40; i++) {
    try {
      const health = await fetch(`${base}/api/health`);
      assert.equal((await health.json()).model_version, "3.1.0");
      break;
    } catch (error) {
      if (i === 39) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const firstResponse = page.waitForResponse(
    (r) => r.url().includes("/api/screen") && r.status() === 200,
    { timeout: 60000 },
  );
  await page.goto(base);
  const baseline = await (await firstResponse).json();
  await ready();
  await button("EN").click();
  assert.equal(await page.locator("[data-input-group]").count(), 7);
  assert.equal(await page.locator('input[type="range"],select').count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: /advanced|professional|simple mode/i })
      .count(),
    0,
  );
  assert.equal(await page.locator("details").count(), 2);
  assert.equal(await page.locator("details[open]").count(), 0);
  assert.equal(
    await page.getByTestId("annual-kwh").innerText(),
    Math.round(baseline.result.annual_kwh).toLocaleString("en-GB"),
  );
  assert.equal(
    baseline.mapped_inputs.weather_scale,
    (await (await fetch(`${base}/api/meta`)).json()).calibration.years.find(
      (r) => r.year === 2025,
    ).ratio,
  );
  assert.equal(baseline.result.actual_rows, 2);
  assert.equal(baseline.verdict, "marginal");
  await page
    .getByTestId("monthly-chart")
    .locator(".recharts-bar-rectangle")
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByTestId("monthly-chart")
      .locator(".recharts-bar-rectangle")
      .count(),
    12,
  );
  assert.equal(await page.locator(".monthly-extreme").count(), 2);
  assert.deepEqual(
    JSON.parse(
      await page.getByTestId("monthly-chart").getAttribute("data-monthly"),
    ),
    baseline.result.monthly_kwh,
  );
  await page.locator(".recharts-bar-rectangle").nth(1).hover();
  await page.getByText("kWh/kW", { exact: false }).last().waitFor();
  assert(
    await page
      .locator(".chart-tooltip")
      .innerText()
      .then((s) => s.includes("kWh/kW")),
  );
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });

  // All seven groups drive real API inputs, including both measurements in groups 1/3.
  let r = await change(
    async () => {
      await label("Roof length").fill("7");
      await label("Roof width").fill("8");
    },
    (r) => r.inputs.roof.depth === 7 && r.inputs.roof.width === 8,
  );
  assert.equal(r.mapped_inputs.house_area, 56);
  assert.deepEqual(r.mapped_inputs.exclusions, []);
  // North must point along the roof's projected geographic axis; both needle
  // and upright N label move, rather than keeping the label above the dial.
  const compassPositions = new Set();
  for (const [name, bearing] of [
    ["N", 0],
    ["NE", 45],
    ["SE", 135],
    ["S", 180],
    ["SW", 225],
    ["W", 270],
    ["NW", 315],
    ["E", 90],
  ]) {
    if (bearing !== r.mapped_inputs.roof_rotation) {
      r = await change(() => button(`Door direction ${name}`).click());
    }
    assert.equal(r.mapped_inputs.roof_rotation, bearing);
    const compass = await page.locator(".scene-compass").evaluate((el) => {
      const label = el.querySelector(".compass-north-label");
      const needle = el.querySelector(".compass-needle");
      const center = new DOMPoint(0, 0).matrixTransform(el.getCTM());
      const tip = new DOMPoint(0, -18).matrixTransform(needle.getCTM());
      return {
        x: Number(label.getAttribute("x")),
        y: Number(label.getAttribute("y")),
        tipX: tip.x - center.x,
        tipY: tip.y - center.y,
        text: label.textContent.trim(),
      };
    });
    const angle = (bearing * Math.PI) / 180;
    const expected = [
      -Math.sin(angle) + 0.58 * Math.cos(angle),
      -0.31 * Math.sin(angle) - 0.52 * Math.cos(angle),
    ];
    const length = Math.hypot(...expected);
    assert.equal(compass.text, "N");
    assert(Math.abs(compass.x / 36 - expected[0] / length) < 1e-6);
    assert(Math.abs(compass.y / 36 - expected[1] / length) < 1e-6);
    assert(
      Math.abs(compass.x * compass.tipY - compass.y * compass.tipX) /
        (36 * Math.hypot(compass.tipX, compass.tipY)) <
        1e-6,
      "N aligns with the arrow tip",
    );
    assert(
      compass.x * compass.tipX + compass.y * compass.tipY > 0,
      "N sits on the north end, not south",
    );
    compassPositions.add(`${compass.x.toFixed(3)},${compass.y.toFixed(3)}`);
    if (bearing === 0 || bearing === 90 || bearing === 180)
      await page.locator(".scene-card").screenshot({
        path: `${output}/compass-door-${name.toLowerCase()}.png`,
      });
  }
  assert.equal(
    compassPositions.size,
    8,
    "All eight roof directions move the N label",
  );
  r = await change(
    async () => {
      await label("Floors above the roof").fill("2");
      await label("Distance to neighbour").fill("6");
    },
    (r) => r.inputs.neighbour.floors === 2 && r.inputs.neighbour.distance === 6,
  );
  assert.deepEqual(
    r.mapped_inputs.horizon,
    [0, 0, 0, 0, 26.6, 40.9, 45, 40.9, 26.6, 0, 0, 0],
  );
  for (const [name, price] of [
    ["Low · 20k", 20000],
    ["Medium · 25k", 25000],
    ["High · 30k", 30000],
  ]) {
    r = await change(() => button(name).click());
    assert.equal(r.mapped_inputs.price_per_kw, price);
  }
  r = await change(() => label("Installation quote per kW").fill("26000"));
  assert.equal(r.mapped_inputs.price_per_kw, 26000);
  for (const [name, costs] of [
    ["Low other costs", [2000, 0, 4000]],
    ["High other costs", [10000, 1000, 10000]],
    ["Medium other costs", [5000, 300, 5000]],
  ]) {
    r = await change(() => button(name).click());
    assert.deepEqual(
      ["fixed_cost", "annual_om", "inverter_cost"].map(
        (k) => r.mapped_inputs[k],
      ),
      costs,
    );
  }
  r = await change(() => label("Completion month").fill("2028-06"));
  assert.equal(r.mapped_inputs.commissioning, "2028-06-01");
  r = await change(() =>
    page.getByRole("switch", { name: "Self-use after 2033" }).check(),
  );
  assert.equal(r.mapped_inputs.post_fit, true);
  assert.equal(r.mapped_inputs.self_use_share, 0.5);
  assert.equal(r.mapped_inputs.self_use_rate, 1.4);
  await page.reload();
  await ready();
  assert.equal(await label("Completion month").inputValue(), "2028-06");
  assert(
    await page.getByRole("switch", { name: "Self-use after 2033" }).isChecked(),
  );
  await reset();

  // Animation is a winter-solstice preview; it must not recalculate annual energy.
  assert.equal(await page.getByTestId("sun-time").innerText(), "12:00");
  const initialAnnual = await page.getByTestId("annual-kwh").innerText();
  let animationRequests = 0;
  const listener = (r) => {
    if (r.url().includes("/api/screen")) animationRequests++;
  };
  page.on("request", listener);
  await button("Play a day").click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="sun-time"]').textContent !==
      "12:00",
  );
  await button("Stop").click();
  assert.equal(await page.getByTestId("sun-time").innerText(), "12:00");
  assert.equal(await page.getByTestId("annual-kwh").innerText(), initialAnnual);
  assert.equal(animationRequests, 0);
  page.off("request", listener);
  r = await change(
    () => button("One more row").click(),
    (p) => p.selected_rows === 3,
  );
  assert.equal(r.result.actual_rows, 3);
  assert.equal(r.result.panels_count, 18);
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('[data-testid="monthly-chart"]')
        ?.getAttribute("data-monthly") === JSON.stringify(expected),
    r.result.monthly_kwh,
  );
  assert.notDeepEqual(r.result.monthly_kwh, baseline.result.monthly_kwh);
  assert(r.result.compliant);
  assert(r.result.annual_kwh > baseline.result.annual_kwh);
  assert(r.result.specific_yield < baseline.result.specific_yield);
  assert.equal(await button("One more row").isDisabled(), true);
  assert(await button("Return to recommendation").isVisible());
  assert(
    (await page.locator(".tradeoff-stats").innerText()).includes("months"),
  );
  await change(
    () => button("One less row").click(),
    (p) => p.selected_rows === 2,
  );

  // Two read-only panels: verbatim bilingual assumptions, reproducible evidence, no fictitious meter data.
  await page.locator(".assumptions-panel summary").click();
  assert.equal(await page.locator(".assumptions-panel tbody tr").count(), 22);
  assert.equal(
    await page
      .locator(".assumptions-panel input,.assumptions-panel select")
      .count(),
    0,
  );
  assert(
    (await page.locator(".assumptions-panel").innerText()).includes("0.970833"),
  );
  await page.locator(".evidence-panel summary").click();
  assert.equal(await page.locator(".monthly-evidence tbody tr").count(), 12);
  assert.equal(
    await page.getByTestId("monthly-correlation").innerText(),
    baseline.monthly_comparison.pearson_r.toFixed(3),
  );
  await page
    .getByRole("heading", { name: "NASA versus HKO observations", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".evidence-block").first().locator("tbody tr").count(),
    3,
  );
  assert(
    (await page.locator(".evidence-panel").innerText()).includes("25 cases"),
  );
  assert(
    (await page.locator(".evidence-panel").innerText()).includes("0.947352"),
  );
  assert(await page.getByText("Pending data", { exact: true }).isVisible());
  const analysisResponse = page.waitForResponse(
    (r) => r.url().includes("/api/analyse") && r.status() === 200,
    { timeout: 120000 },
  );
  await button("Run sensitivity checks").click();
  const analysis = await (await analysisResponse).json();
  assert.equal(analysis.scenarios.length, 9);
  await page.getByText("Neighbour one floor higher", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".evidence-panel table")
      .last()
      .locator("tbody tr")
      .count(),
    9,
  );
  await page.screenshot({ path: `${output}/evidence-en.png`, fullPage: true });
  const report = await download("Download report", "report.html");
  assert(
    report.includes("quote_date") &&
      report.includes("not verified") &&
      report.includes("source_sha256") &&
      report.includes("3.1.0"),
  );
  const archive = JSON.parse(await download("Export 7 inputs", "inputs.json"));
  assert.deepEqual(Object.keys(archive).sort(), ["inputs", "model_version"]);
  assert.deepEqual(Object.keys(archive.inputs).sort(), ownerKeys);
  assert.equal(archive.model_version, "3.1.0");
  r = await change(() => label("Installation quote per kW").fill("24000"));
  assert.equal(
    await page.getByText("Neighbour one floor higher", { exact: true }).count(),
    0,
    "stale evidence disappears",
  );
  const staleReport = await download("Download report", "stale-report.html");
  assert(staleReport.includes("&quot;evidence&quot;: null"));

  const old = {
    schema: "roofsun-hk/v2",
    model_version: "2.2.0",
    plans: [
      {
        inputs: {
          width: 8.06,
          depth: 8.06,
          house_area: 150,
          roof_rotation: 0,
          price_per_kw: 25000,
          commissioning: "2027-01-17",
          horizon: Array(12).fill(80),
          weather_scale: 1.5,
          electrical_model: "linear",
          exclusions: [{ x: 2, y: 2, width: 1, depth: 1 }],
          discount_rate: 0,
          extra_mass_per_module: 400,
        },
        config: { rows: 20 },
        annual_kwh: 9999999,
      },
    ],
  };
  r = await change(() =>
    label("Import inputs file").setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(old)),
    }),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "Recalculated using the new fixed assumptions." })
    .waitFor();
  assert.equal(r.mapped_inputs.house_area, 8.06 * 8.06);
  assert.equal(r.mapped_inputs.electrical_model, "martinez");
  assert.equal(r.mapped_inputs.extra_mass_per_module, 0);
  assert.deepEqual(r.mapped_inputs.horizon, Array(12).fill(0));
  assert.equal(r.result.annual_kwh, baseline.result.annual_kwh);
  assert(
    (await page.locator('[role="status"]').innerText()).includes(
      "0 floors / 10 m",
    ),
  );
  await label("Import inputs file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"plans":[{"inputs":{"width":-1}}]}'),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "The file has invalid inputs / 檔案輸入無效" })
    .waitFor();
  assert.equal(await label("Roof width").inputValue(), "8.06");

  await button("中文").click();
  assert(
    await page
      .getByRole("heading", { name: "這片天台，值得裝太陽能嗎？", exact: true })
      .isVisible(),
  );
  const assumptions = JSON.parse(
    await readFile("data/owner_assumptions.json", "utf8"),
  );
  const cells = await page
    .locator(".assumptions-panel tbody tr")
    .allInnerTexts();
  assumptions.rows.forEach((row, index) =>
    row.zh.forEach((text) =>
      assert(cells[index].includes(text), "Chinese table is verbatim"),
    ),
  );
  assert(await page.getByText("待補充", { exact: true }).isVisible());
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  );
  assert.equal(await page.locator("[data-input-group]").count(), 7);
  await page.screenshot({
    path: `${output}/mobile-zh-evidence.png`,
    fullPage: true,
  });
  await page.locator(".assumptions-panel summary").click();
  await page.locator(".evidence-panel summary").click();
  await page.screenshot({ path: `${output}/mobile-zh.png`, fullPage: true });
  await button("EN").click();
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  );
  await page.screenshot({ path: `${output}/mobile-en.png`, fullPage: true });

  r = await change(
    async () => {
      await label("Roof width").fill("1");
      await label("Roof length").fill("1");
    },
    (p) => p.inputs.roof.width === 1 && p.inputs.roof.depth === 1,
  );
  assert.equal(r.result, null);
  assert.equal(await page.getByTestId("payback").innerText(), "—");
  assert(await button("One more row").isDisabled());
  await page.route("**/api/screen*", (route) => route.abort());
  await label("Roof width").fill("8");
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByTestId("annual-kwh").innerText(), "—");
  await page.unroute("**/api/screen*");
  await change(() => button("Retry").click());
  await reset();
  // Invalid persisted records cannot crash rendering or override assumptions.
  await page.evaluate(() =>
    localStorage.setItem(
      "roofsun-owner-v3",
      JSON.stringify({
        inputs: {
          roof: { width: 8, depth: 7 },
          neighbour: { floors: 0, distance: 10 },
          cost_band: "invalid",
        },
      }),
    ),
  );
  await page.reload();
  await ready();
  assert.equal(await label("Roof width").inputValue(), "8.06");
  assert.deepEqual(errors, [], "No browser runtime exceptions");
  console.log(
    "PASS: seven input groups and mappings, eight-direction compass alignment, persisted answers, real row trade-off, winter-noon/day animation, two read-only panels, nine sensitivity cases and stale-data handling, minimal exports, legacy/invalid imports, bilingual verbatim assumptions, 375px layout, no-space/no-payback, network retry, corrupt-storage recovery.",
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-3500));
  throw error;
} finally {
  await browser.close();
}
