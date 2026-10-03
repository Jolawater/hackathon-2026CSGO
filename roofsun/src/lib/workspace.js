const KEY = "roofsun-workspace-v2";
const SCHEMA = "roofsun-hk/v2";
export function readWorkspace(defaults, defaultConfig) {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (
      value?.schema === SCHEMA &&
      value.inputs &&
      value.config &&
      Array.isArray(value.saved) &&
      value.saved.every(
        (p) => p?.inputs && p?.config && Number.isFinite(p.annual_kwh),
      )
    )
      return {
        inputs: { ...defaults, ...value.inputs },
        config: value.config,
        saved: value.saved.slice(-2),
        preview: value.preview,
      };
  } catch {
    /* An unreadable workspace leaves the original storage intact. */
  }
  return {
    inputs: structuredClone(defaults),
    config: defaultConfig,
    saved: [],
  };
}
export function persistWorkspace(inputs, config, saved, preview) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: SCHEMA, inputs, config, saved, preview }),
    );
    return true;
  } catch {
    return false;
  }
}
export function buildArchive(
  inputs,
  config,
  result,
  saved,
  meta,
  search,
  evidence,
  measuredReference = null,
) {
  return {
    schema: SCHEMA,
    model_version: meta?.model_version || "2.3.0",
    generated_at: new Date().toISOString(),
    simulated: true,
    evidence_scope:
      "Model comparison and scenario analysis; no measured rooftop accuracy claim.",
    inputs,
    config,
    current_result: result,
    plans: saved,
    assumptions: meta?.settings,
    weather_sources: meta?.weather_years,
    decision: search
      ? {
          verdict: search.verdict,
          recommendations: search.recommendations,
          no_install: search.no_install,
          search_scope: search.search_scope,
          tested: search.tested,
        }
      : null,
    evidence: evidence || null,
    irradiance_checks: meta?.irradiance_checks,
    measured_reference: measuredReference,
  };
}
export async function restoreArchive(file, defaults) {
  if (file.size > 1_000_000)
    throw Error("File is larger than 1 MB / 檔案超過 1 MB");
  const value = JSON.parse(await file.text());
  if (![SCHEMA, "roofsun-hk/v1"].includes(value.schema))
    throw Error("Unsupported RoofSun file / 不支援的 RoofSun 檔案");
  if (!Array.isArray(value.plans) || value.plans.length > 2)
    throw Error("Expected up to two saved plans / 最多可載入兩個已儲存方案");
  async function calculate(plan) {
    if (
      !plan?.inputs ||
      !plan?.config ||
      typeof plan.inputs !== "object" ||
      typeof plan.config !== "object"
    )
      throw Error("A plan is missing inputs / 方案缺少輸入");
    const inputs = { ...defaults, ...plan.inputs },
      config = plan.config;
    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, config }),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        "Imported inputs failed model validation / 輸入未通過模型驗證",
      );
    return {
      ...result,
      inputs,
      saved_at: new Date().toISOString(),
      id: crypto.randomUUID(),
    };
  }
  const saved = await Promise.all(value.plans.map(calculate));
  const active =
    value.inputs && value.config ? await calculate(value) : saved[0];
  if (!active) throw Error("File contains no design / 檔案沒有設計");
  const preview = value.preview;
  if (
    preview &&
    (!/^2025-(0[1-9]|1[0-2])-15$/.test(preview.day) ||
      !Number.isFinite(preview.hour) ||
      preview.hour < 0 ||
      preview.hour > 23.99)
  )
    throw Error("Invalid preview month/time");
  return { inputs: active.inputs, config: active.config, saved, preview };
}
function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadArchive(bundle) {
  download(
    JSON.stringify(bundle, null, 2),
    "application/json",
    "roofsun-plans.json",
  );
}
const escape = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function downloadReport(bundle, zh) {
  const t = (en, cn) => (zh ? cn : en),
    r = bundle.current_result,
    i = bundle.inputs,
    name = i.post_fit ? "B" : "A";
  const row = (label, value) =>
    `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`;
  const plans = [
    { ...r, inputs: i, label: t("Current design", "當前設計") },
    ...bundle.plans.map((p, n) => ({
      ...p,
      label: `${t("Saved plan", "已儲存方案")} ${n + 1}`,
    })),
  ];
  const tables = plans
    .map(
      (p) =>
        `<h2>${escape(p.label)}</h2><table>${row(t("Configuration", "配置"), JSON.stringify(p.config))}${row(t("Annual energy", "全年發電"), `${p.annual_kwh} kWh`)}${row(t("Investment", "初始投資"), `HK$ ${p.initial_cost}`)}${row(t("Shade loss", "遮擋損失"), `${p.shading_loss_pct}%`)}${row(t("Sustained payback date", "持續回本日期"), p[`stable_payback_${p.inputs.post_fit ? "B" : "A"}`] || t("Not reached / not applicable", "未達成／不適用"))}${row(t("NPV", "淨現值"), p[`npv_${p.inputs.post_fit ? "B" : "A"}`])}${row(t("Input record", "輸入記錄"), JSON.stringify(p.inputs))}</table>`,
    )
    .join("");
  const html = `<!doctype html><html lang="${zh ? "zh-Hant" : "en"}"><meta charset="utf-8"><title>RoofSun HK — ${t("Decision report", "決策報告")}</title><style>body{max-width:1000px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui;color:#254f38}table{border-collapse:collapse;width:100%}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;overflow-wrap:anywhere}th{width:25%}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}h2{margin-top:36px}@media print{button{display:none}table{break-inside:avoid}body{margin:0}}</style><h1>RoofSun HK — ${t("Decision report", "決策報告")}</h1><p>${escape(bundle.generated_at)} · ${escape(bundle.model_version)}</p><p>${t("Simulated results. Preliminary checks do not establish structural safety. Cross-model checks are not measured accuracy. Scenario envelopes are not confidence intervals.", "結果為模擬。初步條件檢查不能判定結構安全。參考模型核對不代表實測準確率，情景範圍並非置信區間。")}</p><button onclick="window.print()">${t("Print / save PDF", "列印／儲存 PDF")}</button><h2>${t("What this comparison helps you decide", "這份比較幫你決定甚麼")}</h2><p>${t("Use the same roof and weather to compare investment, generation, space and sustained payback before confirming an installation proposal with your installer. User scenarios are design assumptions; no completed interviews are claimed.", "在確認安裝方案前，以相同天台和氣象比較投資、發電、空間與持續回本，再與安裝師傅確認。用戶場景是設計假設，沒有聲稱已完成訪談。")}</p><p>${t("First break-even is the first nonnegative cash balance. Sustained payback also checks later modeled costs. NPV discounts future cash. These are conditional calculations, not guaranteed returns.", "首次回本是結餘第一次非負；持續回本還會檢查後續模型費用。淨現值把未來現金折現。以上是條件計算，不是收益保證。")}</p><h2>${t("Decision", "決策")}</h2><p>${escape(bundle.decision?.verdict)} · ${escape(JSON.stringify(r.decision))}</p>${tables}<h2>${t("Monthly generation", "每月發電")}</h2><table>${r.monthly_kwh.map((k, m) => row(`${m + 1}`, `${k} kWh`)).join("")}</table><h2>${t("Reference, assumptions and complete reproducibility record", "來源、假設與完整復核記錄")}</h2><pre>${escape(JSON.stringify(bundle, null, 2))}</pre></html>`;
  download(html, "text/html", "roofsun-decision-report.html");
}
