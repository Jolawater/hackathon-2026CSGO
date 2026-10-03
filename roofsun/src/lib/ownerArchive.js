import { OWNER_DEFAULTS } from "../components/Screening.jsx";
const KEY = "roofsun-owner-v3";
export function readOwner() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    const i = data?.inputs;
    const within = (n, low, high) =>
      Number.isFinite(n) && n >= low && n <= high;
    if (
      i?.roof &&
      i?.neighbour &&
      within(i.roof.width, 1, 30) &&
      within(i.roof.depth, 1, 30) &&
      within(i.neighbour.floors, 0, 15) &&
      within(i.neighbour.distance, 0.5, 200) &&
      [0, 45, 90, 135, 180, 225, 270, 315].includes(i.door_direction) &&
      within(i.price_per_kw, 1, 100000) &&
      ["low", "medium", "high"].includes(i.cost_band) &&
      /^(202[6-9]|203[0-3])-(0[1-9]|1[0-2])$/.test(i.commissioning_month) &&
      typeof i.post_fit === "boolean"
    )
      return Object.fromEntries(
        Object.keys(OWNER_DEFAULTS).map((k) => [k, i[k]]),
      );
  } catch {
    /* Retain the unreadable original record; begin with a valid example. */
  }
  return structuredClone(OWNER_DEFAULTS);
}
export function persistOwner(inputs, version) {
  localStorage.setItem(KEY, JSON.stringify(ownerArchive(inputs, version)));
}
export function ownerArchive(inputs, version) {
  return {
    model_version: version,
    inputs: Object.fromEntries(
      Object.keys(OWNER_DEFAULTS).map((k) => [k, inputs[k]]),
    ),
  };
}
function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadOwner(inputs, version) {
  download(
    JSON.stringify(ownerArchive(inputs, version), null, 2),
    "application/json",
    "roofsun-seven-inputs.json",
  );
}
export async function importOwner(file) {
  if (file.size > 1_000_000) throw Error("File exceeds 1 MB / 檔案超過 1 MB");
  const payload = JSON.parse(await file.text());
  const response = await fetch("/api/import-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw Error("The file has invalid inputs / 檔案輸入無效");
  return result;
}
const escape = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function downloadOwnerReport(screen, analysis, assumptions, zh) {
  const t = (en, cn) => (zh ? cn : en);
  const r = screen.result;
  const summary = r
    ? `${r.actual_rows} ${t("rows", "排")} · ${r.panels_count} ${t("modules", "塊面板")} · ${r.capacity_kw} kW · ${r.config.tilt}°`
    : t("No feasible system", "沒有可行系統");
  const record = {
    model_version: screen.model_version,
    generated_at: new Date().toISOString(),
    simulated: true,
    owner_inputs: screen.inputs,
    configuration: r?.config,
    result: r,
    interval: screen.interval,
    delay: screen.delay,
    evidence: analysis || null,
    quote_record: {
      source:
        "Owner-entered value; installer and quotation document not verified",
      quote_date: null,
    },
    panel_record:
      "Generic reference specification in data/settings.json; not a verified commercial panel",
    assumptions,
  };
  const html = `<!doctype html><html lang="${zh ? "zh-Hant" : "en"}"><meta charset="utf-8"><title>RoofSun HK</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui;color:#263a2c}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}@media print{button{display:none}}</style><h1>RoofSun HK</h1><p>${t("Screening before contacting an installer. Simulated results, not engineering design or financial advice.", "聯絡安裝商前的初步篩選。結果屬模擬，並非工程設計或財務建議。")}</p><h2>${escape(summary)}</h2><p>${t("Conclusion", "結論")}: ${escape(screen.verdict)}</p>${r ? `<p>${t("Annual generation", "首年發電")}: ${escape(r.annual_kwh)} kWh · ${t("Sustained payback", "持續回本")}: ${escape(r.payback_date)}</p>` : ""}<p>${t("Quote source and date were not supplied. The generation date is the report date, not the installer’s quote date.", "未提供安裝商報價來源及日期。生成日期是本報告日期，並非安裝商報價日期。")}</p><button onclick="window.print()">${t("Print / save PDF", "列印／儲存 PDF")}</button><h2>${t("Inputs, assumptions and reproducible model results", "輸入、假設及可復核模型結果")}</h2><pre>${escape(JSON.stringify(record, null, 2))}</pre></html>`;
  download(html, "text/html", "roofsun-screening-report.html");
}
