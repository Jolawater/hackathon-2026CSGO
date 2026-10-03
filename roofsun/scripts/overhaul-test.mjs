import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ROOFSUN_TEST_URL || "http://127.0.0.1:8000";
const out = process.env.ROOFSUN_TEST_OUTPUT || "/tmp/roofsun-overhaul";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.ROOFSUN_BROWSER_CHANNEL || undefined,
  args: ["--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = { checks: [], metrics: {} };
const check = (name, value) => {
  assert(value, name);
  report.checks.push(name);
};
const ready = () =>
  page.waitForFunction(
    () =>
      document.querySelector(".results-column")?.getAttribute("aria-busy") ===
        "false" && !document.querySelector('[data-number-moving="true"]'),
    null,
    { timeout: 60000 },
  );
const button = (name) => page.getByRole("button", { name, exact: true });
try {
  const health = await (await fetch(base + "/api/health")).json();
  check("Startup prewarm completed", health.warmup.status === "ready");
  report.metrics.startupExampleSeconds = health.warmup.examples.map(
    (e) => e.seconds,
  );
  report.metrics.cachedApiMilliseconds = [];
  for (const e of health.warmup.examples) {
    const start = performance.now();
    const res = await fetch(base + "/api/screen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: e.inputs, selected_rows: null }),
    });
    const r = await res.json();
    const elapsed = performance.now() - start;
    report.metrics.cachedApiMilliseconds.push(Math.round(elapsed));
    check(
      "Cached screen responds below 1 second " +
        e.inputs.neighbours.map((n) => n.direction).join(","),
      res.ok && elapsed < 1000,
    );
    const ev = performance.now();
    await (
      await fetch(base + "/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: r.mapped_inputs,
          config: r.result.config,
        }),
      })
    ).json();
    check(
      "Cached evaluate responds below 1 second",
      performance.now() - ev < 1000,
    );
  }
  await page.goto(base);
  await ready();
  await page.waitForTimeout(800);
  check(
    "No canvas on initial screen",
    (await page.locator("canvas").count()) === 0,
  );
  const hero = await page.evaluate(() => ({
    title: document.querySelector("#intro h1").getBoundingClientRect().bottom,
    actions: document.querySelector(".intro-actions").getBoundingClientRect()
      .bottom,
    trust: document.querySelector(".intro-trust").getBoundingClientRect()
      .bottom,
    next: document.querySelector(".how-it-works").getBoundingClientRect().top,
    svgBytes: new TextEncoder().encode(
      document.querySelector("#intro svg").outerHTML,
    ).length,
  }));
  report.metrics.hero = hero;
  check(
    "1440x900 hero fits and next section peeks",
    hero.title < 900 &&
      hero.actions < 900 &&
      hero.trust < 900 &&
      hero.next < 900,
  );
  check("Inline hero SVG below 8KB", hero.svgBytes < 8192);
  await page.screenshot({ path: out + "/intro-zh.png" });
  await button("開始填寫我的天台 →").click();
  check(
    "Start focuses roof length",
    await page
      .getByLabel("天台長度", { exact: true })
      .evaluate((e) => e === document.activeElement),
  );
  await button("EN").click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: out + "/intro-en.png" });
  await button("How the model works").click();
  check(
    "How it works opens assumptions",
    await page.locator(".assumptions-panel").evaluate((e) => e.open),
  );
  await page.locator(".assumptions-panel summary").click();
  await button("See an example").click();
  report.metrics.exampleClickMilliseconds = [];
  // Start with a non-default example so each click changes the input key.
  for (const name of [
    "Tall southern neighbour",
    "Neighbours on both sides",
    "Open rooftop",
  ]) {
    const response = page.waitForResponse(
      (r) => r.url().includes("/api/screen") && r.status() === 200,
    );
    await button(name).scrollIntoViewIfNeeded();
    const start = performance.now();
    await button(name).click();
    await response;
    await page.waitForFunction(
      () =>
        document.querySelector(".results-column")?.getAttribute("aria-busy") ===
        "false",
    );
    const elapsed = performance.now() - start;
    report.metrics.exampleClickMilliseconds.push({
      name,
      ms: Math.round(elapsed),
    });
    check("Example visible below 1 second: " + name, elapsed < 1000);
    await ready();
  }
  check(
    "Only one neighbour cannot be removed",
    (await page
      .getByRole("button", { name: "Remove neighbour 1", exact: true })
      .count()) === 0,
  );
  const add = button("+ Add another neighbour (up to 3)");
  await add.click();
  await add.click();
  check("Fourth neighbour disabled", await add.isDisabled());
  check(
    "New directions use unused priority",
    (await page
      .getByLabel("Neighbour 2 direction", { exact: true })
      .inputValue()) === "90" &&
      (await page
        .getByLabel("Neighbour 3 direction", { exact: true })
        .inputValue()) === "270",
  );
  await button("Remove neighbour 3").click();
  await button("Remove neighbour 2").click();
  await page
    .getByLabel("Neighbour 1 direction", { exact: true })
    .selectOption("90");
  check(
    "Direction contains relative front-door hints",
    (
      await page
        .getByLabel("Neighbour 1 direction", { exact: true })
        .innerText()
    ).includes("on your right"),
  );
  await button("Neighbours on both sides").click();
  await ready();
  await page.locator("#layout").scrollIntoViewIfNeeded();
  await page.locator(".scene3d canvas").waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector(".scene3d canvas")?.dataset.renderActive ===
      "true",
  );
  check(
    "3D contains east and west buildings",
    await page
      .locator(".scene3d canvas")
      .evaluate(
        (e) =>
          JSON.stringify(
            JSON.parse(e.dataset.neighbourDirections).sort((a, b) => a - b),
          ) === "[90,270]",
      ),
  );
  const gap = await page.evaluate(() => {
    const a = document.querySelector(".tradeoff-card").getBoundingClientRect(),
      b = document.querySelector(".monthly-generation").getBoundingClientRect();
    return b.top - a.bottom;
  });
  report.metrics.rightColumnGapPx = gap;
  check("Right cards gap below 200px", gap >= 0 && gap <= 200);
  await page.locator("#layout").screenshot({ path: out + "/layout.png" });
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".scene3d canvas")?.dataset.renderActive ===
      "false",
  );
  const first = await page
    .locator(".scene3d canvas")
    .getAttribute("data-render-count");
  await page.waitForTimeout(700);
  const second = await page
    .locator(".scene3d canvas")
    .getAttribute("data-render-count");
  report.metrics.offscreenFramesIn700ms = Number(second) - Number(first);
  check("Offscreen has zero rendering frames", first === second);
  await page.locator("#layout").scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      document.querySelector(".scene3d canvas")?.dataset.renderActive ===
      "true",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  check(
    "Hidden document pauses rendering",
    (await page
      .locator(".scene3d canvas")
      .getAttribute("data-render-active")) === "false",
  );
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const defaults = health.warmup.examples[0].inputs;
  const legacy = { ...defaults, neighbour: { floors: 2.5, distance: 7.5 } };
  delete legacy.neighbours;
  await page.evaluate(
    (i) =>
      localStorage.setItem(
        "roofsun-owner-v3",
        JSON.stringify({ model_version: "3.1.0", inputs: i }),
      ),
    legacy,
  );
  await page.reload();
  await ready();
  check(
    "Legacy browser data migrated intact",
    (await page
      .getByLabel("Floors above the roof 1", { exact: true })
      .inputValue()) === "2.5" &&
      (await page
        .getByLabel("Distance to neighbour 1", { exact: true })
        .inputValue()) === "7.5",
  );
  const legacyImport = { ...legacy, neighbour: { floors: 1.5, distance: 9 } };
  await page
    .getByLabel("Import inputs file", { exact: true })
    .setInputFiles({
      name: "legacy-v3.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ model_version: "3.1.0", inputs: legacyImport }),
      ),
    });
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Distance to neighbour 1"]')
        ?.value === "9",
  );
  await ready();
  check(
    "Legacy JSON migrated intact",
    (await page
      .getByLabel("Floors above the roof 1", { exact: true })
      .inputValue()) === "1.5",
  );
  // Slow a cached request to verify actual elapsed feedback and one in-flight calculation.
  let active = 0,
    maxActive = 0,
    requests = [];
  await page.route("**/api/screen*", async (route) => {
    active++;
    maxActive = Math.max(maxActive, active);
    requests.push(route.request().postDataJSON().inputs.price_per_kw);
    await new Promise((r) => setTimeout(r, 2400));
    await route.continue();
    active--;
  });
  await page
    .getByLabel("Installation quote per kW", { exact: true })
    .fill("21000");
  await page.waitForTimeout(1600);
  check(
    "Wait feedback shows real elapsed seconds",
    /[1-9]s elapsed/.test(await page.locator(".calculation-wait").innerText()),
  );
  await page
    .getByLabel("Installation quote per kW", { exact: true })
    .fill("22000");
  await page
    .getByLabel("Installation quote per kW", { exact: true })
    .fill("23000");
  await ready();
  await page.unroute("**/api/screen*");
  check(
    "Rapid edits coalesce with at most one request",
    maxActive === 1 && requests.at(-1) === 23000 && !requests.includes(22000),
  );
  report.metrics.coalescedRequests = requests;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  check(
    "Reduced motion disables CSS movement",
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".intro-sun")).animationName ===
          "none" &&
        getComputedStyle(document.documentElement).scrollBehavior === "auto",
    ),
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(300);
  check(
    "375px no horizontal overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  check(
    "Mobile navigation simplified",
    (await button("Start").isVisible()) &&
      !(await page.locator(".section-nav").isVisible()),
  );
  await page.screenshot({ path: out + "/mobile-intro-en.png" });
  await page.locator("#results").scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  check(
    "Mobile result bar hides at results",
    (await page.locator(".mobile-result-bar").count()) === 0,
  );
  await page.screenshot({ path: out + "/mobile-results-en.png" });
  await button("中文").click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  check(
    "Chinese mobile fits",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: out + "/mobile-intro-zh.png" });
  check("No JavaScript page errors", errors.length === 0);
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  await page.screenshot({
    path: out + "/overhaul-failure.png",
    fullPage: true,
  });
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(
    out + "/overhaul-results.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
