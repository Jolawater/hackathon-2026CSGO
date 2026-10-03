import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import {
  Sun,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Plus,
  Minus,
  Play,
  Pause,
  Check,
  AlertTriangle,
  LoaderCircle,
} from "lucide-react";
import OwnerInputs, {
  OWNER_DEFAULTS,
  neighbourHorizon,
} from "./components/Screening.jsx";
import RoofScene from "./components/RoofScene.jsx";
import CashflowChart from "./components/CashflowChart.jsx";
import MonthlyGeneration from "./components/MonthlyGeneration.jsx";
import Assumptions from "./components/Assumptions.jsx";
import Evidence, { verdictText } from "./components/Evidence.jsx";
import assumptions from "../data/owner_assumptions.json";
import { useApi } from "./lib/api.js";
import { fmt, money } from "./lib/format.js";
import {
  readOwner,
  persistOwner,
  downloadOwner,
  importOwner,
  downloadOwnerReport,
} from "./lib/ownerArchive.js";
import "./style.css";
const VERSION = "3.1.0";

function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("roofsun-language") || "zh",
  );
  const zh = lang === "zh",
    t = (en, cn) => (zh ? cn : en);
  const [inputs, setInputs] = useState(readOwner),
    [selectedRows, setSelectedRows] = useState(null),
    [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false),
    [frame, setFrame] = useState(12);
  const [notice, setNotice] = useState(""),
    [fileError, setFileError] = useState(""),
    [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState(null),
    [analysisLoading, setAnalysisLoading] = useState(false),
    [analysisError, setAnalysisError] = useState("");
  const analysisAbort = useRef(null),
    importRef = useRef(null);
  const payload = useMemo(
    () => ({ inputs, selected_rows: selectedRows }),
    [inputs, selectedRows],
  );
  const ownerKey = JSON.stringify(inputs);
  const meta = useApi(`/api/meta?retry=${retry}`, undefined, 0),
    validation = useApi(`/api/validation?retry=${retry}`, undefined, 0);
  const calculated = useApi(`/api/screen?retry=${retry}`, payload, 450);
  const ready = calculated.data && !calculated.loading && !calculated.error;
  const screen = ready ? calculated.data : null,
    r = screen?.result;
  const evaluationPayload = useMemo(
    () => (r ? { inputs: screen.mapped_inputs, config: r.config } : undefined),
    [screen],
  );
  const cashEvaluation = useApi(
    `/api/evaluate?retry=${retry}`,
    evaluationPayload,
    0,
    Boolean(r),
  );
  const onChange = (value) => {
    setInputs(value);
    setSelectedRows(null);
    setNotice("");
    setPlaying(false);
    setFrame(12);
  };
  useEffect(() => {
    localStorage.setItem("roofsun-language", lang);
    document.documentElement.lang = zh ? "zh-Hant" : "en";
  }, [lang]);
  useEffect(() => {
    try {
      persistOwner(inputs, VERSION);
    } catch {
      setFileError(
        t(
          "Browser storage is unavailable. Export inputs to save them.",
          "瀏覽器儲存不可用，請匯出輸入以保留資料。",
        ),
      );
    }
  }, [inputs]);
  useEffect(() => {
    analysisAbort.current?.abort();
    setAnalysis(null);
    setAnalysisLoading(false);
    setAnalysisError("");
  }, [ownerKey]);
  useEffect(() => {
    setPlaying(false);
    setFrame(12);
  }, [calculated.loading, selectedRows]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setFrame((old) => {
          if (old >= 24) {
            setPlaying(false);
            return 12;
          }
          return old + 1;
        }),
      450,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const sun = screen?.sun_path?.[frame];
  const sceneInputs = {
    width: inputs.roof.width,
    depth: inputs.roof.depth,
    roof_rotation: inputs.door_direction,
    exclusions: [],
    horizon: neighbourHorizon(
      inputs.neighbour.floors,
      inputs.neighbour.distance,
    ),
  };
  async function analyse() {
    analysisAbort.current?.abort();
    const controller = new AbortController();
    analysisAbort.current = controller;
    setAnalysisLoading(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
        signal: controller.signal,
      });
      if (!response.ok) throw Error("Failed");
      const data = await response.json();
      if (!controller.signal.aborted) setAnalysis(data);
    } catch (e) {
      if (e.name !== "AbortError") setAnalysisError(e.message);
    } finally {
      if (!controller.signal.aborted) setAnalysisLoading(false);
    }
  }
  async function importFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    setNotice("");
    setFileError("");
    try {
      const record = await importOwner(file);
      onChange(record.inputs);
      setNotice(record.migrated ? "legacy" : "recalculated");
    } catch (error) {
      setFileError(error.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }
  const configLabel = (result) =>
    result
      ? `${result.actual_rows} ${t("rows", "排")} · ${result.panels_count} ${t("modules", "塊面板")} · ${fmt(result.capacity_kw, 2)} kW`
      : "";
  const payback = (value) =>
    value == null
      ? t("No sustained payback within 25 years", "25 年內未持續回本")
      : t(`${fmt(value, 2)} years`, `${fmt(value, 2)} 年`);
  const trade = screen?.tradeoff;
  const verdict = screen?.verdict;
  const recommendedInterval = screen?.recommended_interval;
  return (
    <>
      <header className="site-header">
        <a href="#" className="brand" aria-label="RoofSun HK">
          <span>
            <Sun size={22} />
          </span>
          <strong>
            RoofSun <small>HK</small>
          </strong>
        </a>
        <span className="header-caption">
          {t("Before you contact an installer", "聯絡安裝商之前，先算清楚")}
        </span>
        <button
          className="language-button"
          onClick={() => setLang(zh ? "en" : "zh")}
        >
          {zh ? "EN" : "中文"}
        </button>
      </header>
      <main className="app-shell">
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              {t("SEVEN QUESTIONS ABOUT YOUR HOME", "七個關於屋企的問題")}
            </span>
            <h1>
              {t(
                "Will solar pay off on your roof?",
                "這片天台，值得裝太陽能嗎？",
              )}
            </h1>
            <p>
              {t(
                "Compare payback, the quote and the effect of adding another row.",
                "比較回本、報價，以及多裝一排的取捨。",
              )}
            </p>
          </div>
          <button
            className="quiet-button"
            onClick={() => {
              onChange(structuredClone(OWNER_DEFAULTS));
              setFileError("");
            }}
          >
            <RotateCcw size={15} />
            {t("Reset example", "重設示例")}
          </button>
        </div>
        {(notice || fileError) && (
          <div
            className={fileError ? "error-notice" : "info-notice"}
            role="status"
          >
            {fileError ||
              t(
                "Recalculated using the new fixed assumptions.",
                "已按新版固定假設重新計算。",
              )}
            {notice === "legacy" && (
              <p>
                {t(
                  "The old file does not record neighbour floors and distance. These reset to 0 floors / 10 m: please review them. Removed settings, saved results and manual layouts were ignored; other costs were mapped to a preset.",
                  "舊檔案未記錄鄰屋層數及距離，已重設為 0 層／10 m，請核對。已忽略刪除的參數、舊結果及手動排布；其他費用按預設檔位換算。",
                )}
              </p>
            )}
          </div>
        )}
        <div className="screening-grid">
          <aside className="input-card">
            <div className="input-card-heading">
              <h2>{t("Your roof", "你的天台")}</h2>
              <span>{t("7 inputs", "7 項輸入")}</span>
            </div>
            <OwnerInputs inputs={inputs} onChange={onChange} t={t} />
            <p className="input-note">
              {t(
                "Default dimensions and prices are illustrative assumptions. Replace them with your own measurements and quote.",
                "預設尺寸及價格均屬示例假設，請改為實際量度及報價。",
              )}
            </p>
          </aside>
          <div className="results-column" aria-busy={calculated.loading}>
            <section
              className={`conclusion-card ${verdict || "loading"}`}
              aria-live="polite"
            >
              <span className="eyebrow">
                {t("SIMULATED SCREENING RESULT", "模擬篩選結果")}
              </span>
              <h2>
                {calculated.loading ? (
                  <>
                    <LoaderCircle size={24} className="spin" />
                    {t("Finding a suitable layout…", "正在搜尋合適排布…")}
                  </>
                ) : calculated.error ? (
                  t("Please check your inputs", "請檢查輸入")
                ) : (
                  verdictText(verdict, t)
                )}
              </h2>
              {r ? (
                <>
                  <p className="recommended-layout">
                    {!screen.is_recommended
                      ? t("Exploring", "正在探索")
                      : verdict === "not_recommended"
                        ? t("Best tested candidate", "已測試的最佳候選")
                        : t("Suggested layout", "建議配置")}
                    ：<strong>{configLabel(r)}</strong>
                  </p>
                  <p>
                    {verdict === "worthwhile"
                      ? t(
                          "NPV stays positive in all three tested scenarios.",
                          "三個測試情景的淨現值均為正。",
                        )
                      : verdict === "marginal"
                        ? t(
                            "The result depends on the assumptions: some scenarios have positive NPV and others do not.",
                            "結果取決於假設：部分情景淨現值為正，部分則不是。",
                          )
                        : t(
                            "None of the three scenarios has positive NPV at this quote.",
                            "按這個報價，三個情景的淨現值均不為正。",
                          )}
                  </p>
                </>
              ) : screen ? (
                <p>
                  {t(
                    "No system of at least 2 kW passes the selected roof, coverage and loading checks.",
                    "沒有至少 2 kW 的系統通過所選天台、覆蓋及荷載檢查。",
                  )}
                </p>
              ) : (
                <p>
                  {t(
                    "A result will appear after calculation.",
                    "完成計算後會顯示結果。",
                  )}
                </p>
              )}
            </section>
            {calculated.error && (
              <div role="alert" className="error-notice">
                <span>
                  {t(
                    "Calculation failed. Check the measurements and completion month, then retry.",
                    "計算失敗，請檢查尺寸及完工月份後重試。",
                  )}
                </span>
                <button onClick={() => setRetry((v) => v + 1)}>
                  {t("Retry", "重試")}
                </button>
              </div>
            )}
            <section
              className="headline-metrics"
              aria-label={t("Three key results", "三個主要結果")}
            >
              <div>
                <span>{t("FIRST-YEAR GENERATION", "首年發電")}</span>
                <strong data-testid="annual-kwh">
                  {r ? fmt(r.annual_kwh) : "—"}
                </strong>
                <small>kWh / {t("year", "年")}</small>
              </div>
              <div>
                <span>{t("SUSTAINED PAYBACK", "持續回本時間")}</span>
                <strong
                  className={!r?.payback_years ? "long-value" : ""}
                  data-testid="payback"
                >
                  {r ? payback(r.payback_years) : "—"}
                </strong>
                <small>
                  {r?.payback_date
                    ? t(
                        `Around ${r.payback_date.slice(0, 7)}`,
                        `約 ${r.payback_date.slice(0, 7)}`,
                      )
                    : t("Under the selected assumptions", "按所選假設")}
                </small>
              </div>
              <div>
                <span>{t("HIGHEST ACCEPTABLE QUOTE", "最高可接受報價")}</span>
                <strong
                  className={
                    r && r.quote_ceiling_per_kw <= 0 ? "long-value" : ""
                  }
                  data-testid="quote-ceiling"
                >
                  {r
                    ? r.quote_ceiling_per_kw > 0
                      ? money(r.quote_ceiling_per_kw)
                      : t(
                          "No positive quote breaks even",
                          "沒有正報價可達收支平衡",
                        )
                    : "—"}
                </strong>
                <small>
                  {t(
                    "per kW · NPV = 0 in the current scenario",
                    "每千瓦 · 當前情景 NPV = 0",
                  )}
                </small>
              </div>
            </section>
            <p className="metric-caption">
              {t(
                "A quote below this ceiling gives positive NPV in the current scenario; the three-scenario range determines the overall conclusion.",
                "報價低於上限，當前情景的淨現值才為正；整體結論仍按三個情景判斷。",
              )}
            </p>
            <div className="visual-comparison">
              <section className="scene-card">
                <div className="section-top">
                  <div>
                    <h3>{t("A layout you can compare", "看得見的排布取捨")}</h3>
                    <p>
                      {r
                        ? t(
                            `Tilt ${r.config.tilt}° · direction ${r.config.azimuth}° · automatically searched`,
                            `傾角 ${r.config.tilt}° · 朝向 ${r.config.azimuth}° · 系統自動搜尋`,
                          )
                        : "—"}
                    </p>
                  </div>
                  <button
                    className="play-button"
                    disabled={!r}
                    aria-pressed={playing}
                    onClick={() => {
                      setPlaying((v) => !v);
                      setFrame(playing ? 12 : 0);
                    }}
                  >
                    {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
                    {playing ? t("Stop", "停止") : t("Play a day", "播放一天")}
                  </button>
                </div>
                <div className="scene-wrapper">
                  {r && sun ? (
                    <RoofScene
                      inputs={sceneInputs}
                      config={r.config}
                      result={r}
                      sun={sun}
                      t={t}
                      topView={false}
                    />
                  ) : (
                    <div className="scene-empty">
                      {calculated.loading
                        ? t("Calculating layout…", "正在計算排布…")
                        : t("No feasible layout", "沒有可行排布")}
                    </div>
                  )}
                </div>
                <p className="scene-caption">
                  {t("Winter solstice · Hong Kong time", "冬至 · 香港時間")}{" "}
                  <strong data-testid="sun-time">
                    {sun
                      ? `${String(Math.floor(sun.hour)).padStart(2, "0")}:${sun.hour % 1 ? "30" : "00"}`
                      : "12:00"}
                  </strong>{" "}
                  ·{" "}
                  {t(
                    "Preview 06:00–18:00; annual generation uses the full year.",
                    "播放 06:00–18:00；全年發電按全年計算。",
                  )}
                </p>
                {r && <MonthlyGeneration result={r} t={t} />}
              </section>
              <section className="tradeoff-card">
                <span className="eyebrow">
                  {t("ADD PANELS. SEE THE TRADE-OFF.", "增加面板，看清取捨")}
                </span>
                <h3>
                  {t("What does another row change?", "再加一排，有甚麼分別？")}
                </h3>
                <div className="row-buttons">
                  <button
                    disabled={!screen?.alternatives?.less}
                    onClick={() => setSelectedRows(screen.alternatives.less)}
                  >
                    <Minus size={16} />
                    {t("One less row", "少一排")}
                  </button>
                  <button
                    disabled={!screen?.alternatives?.more}
                    onClick={() => setSelectedRows(screen.alternatives.more)}
                  >
                    <Plus size={16} />
                    {t("One more row", "再加一排")}
                  </button>
                </div>
                {trade ? (
                  <>
                    <p className="pair-label">
                      {trade.from.actual_rows} → {trade.to.actual_rows}{" "}
                      {t("rows", "排")} · {trade.from.panels_count} →{" "}
                      {trade.to.panels_count} {t("modules", "塊")}
                    </p>
                    <dl className="tradeoff-stats">
                      <div>
                        <dt>{t("Annual generation", "全年發電")}</dt>
                        <dd>
                          {trade.extra_kwh >= 0 ? "+" : ""}
                          {fmt(trade.extra_kwh)} kWh
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Installation cost", "安裝投資")}</dt>
                        <dd>
                          {trade.extra_cost >= 0 ? "+" : ""}
                          {money(trade.extra_cost)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Payback difference", "回本時間差")}</dt>
                        <dd>
                          {trade.payback_months == null
                            ? t(
                                "One design does not pay back",
                                "其中一案未能回本",
                              )
                            : t(
                                `${trade.payback_months > 0 ? "+" : ""}${fmt(trade.payback_months, 1)} months`,
                                `${trade.payback_months > 0 ? "+" : ""}${fmt(trade.payback_months, 1)} 個月`,
                              )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Shade loss", "遮擋損失")}</dt>
                        <dd>
                          {fmt(trade.from.shading_loss_pct, 1)}% →{" "}
                          {fmt(trade.to.shading_loss_pct, 1)}%
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Energy per kW", "每千瓦發電")}</dt>
                        <dd>
                          {fmt(trade.from.specific_yield)} →{" "}
                          {fmt(trade.to.specific_yield)}
                        </dd>
                      </div>
                    </dl>
                    <p className="help">
                      {trade.angles_changed
                        ? t(
                            "Tilt/direction are re-optimised for each row count so the layouts remain buildable. This comparison includes that adjustment.",
                            "系統按每個排數重新搜尋傾角／朝向，以保持排布可行；比較包含這項調整。",
                          )
                        : t(
                            "Compare buildable layouts with the same tilt and direction.",
                            "比較相同傾角及朝向的可行排布。",
                          )}
                    </p>
                  </>
                ) : (
                  <p className="help">
                    {t(
                      "No neighbouring row count passes the coverage and spacing checks.",
                      "沒有相鄰排數的方案通過覆蓋及間隙檢查。",
                    )}
                  </p>
                )}
                {r && !screen.is_recommended && (
                  <button
                    className="text-button"
                    onClick={() => setSelectedRows(null)}
                  >
                    {t("Return to recommendation", "返回推薦配置")}
                  </button>
                )}
              </section>
            </div>
            {r &&
              (cashEvaluation.loading ? (
                <p className="help" role="status">
                  {t("Loading monthly cash flow…", "正在載入逐月現金流…")}
                </p>
              ) : cashEvaluation.error ? (
                <p className="error-notice" role="alert">
                  {t("Cash-flow chart could not load.", "未能載入現金流圖。")}{" "}
                  <button onClick={() => setRetry((v) => v + 1)}>
                    {t("Retry", "重試")}
                  </button>
                </p>
              ) : (
                meta.data?.settings && (
                  <CashflowChart
                    result={cashEvaluation.data}
                    inputs={screen.mapped_inputs}
                    settings={meta.data.settings}
                    selected={inputs.post_fit}
                    t={t}
                  />
                )
              ))}
            <div className="result-notes">
              {r && (
                <p>
                  <strong>
                    {t("Installation estimate", "估算安裝投資")}{" "}
                    {money(r.initial_cost)}
                  </strong>{" "}
                  ·{" "}
                  {t(
                    "Includes the selected setup allowance.",
                    "已包含所選固定費用。",
                  )}
                </p>
              )}
              {screen?.delay && (
                <p>
                  {t(
                    "Finish 6 months later: model NPV",
                    "遲 6 個月裝好：模型淨現值",
                  )}
                  {screen.delay.npv_lost >= 0
                    ? t(" falls by ", "減少 ")
                    : t(" changes by ", "變化 ")}
                  <strong>{money(Math.abs(screen.delay.npv_lost))}</strong> ·{" "}
                  {t(
                    "FiT payments end on 31 Dec 2033.",
                    "上網電價收入於 2033 年 12 月 31 日結束。",
                  )}
                </p>
              )}
              {r?.capacity_kw > 10 && (
                <p className="warning-line">
                  <AlertTriangle size={16} />
                  {t(
                    "This system exceeds 10 kW; its FiT rate drops from HK$4 to HK$3 per kWh.",
                    "此系統超過 10 kW，上網電價由每度 HK$4 降至 HK$3。",
                  )}
                </p>
              )}
              {r && (
                <p className="load-line">
                  {r.load_kg_m2 <= r.load_limit_kg_m2 ? (
                    <Check size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}{" "}
                  {t("Load check", "荷載檢查")} {fmt(r.load_kg_m2, 1)} /{" "}
                  {fmt(r.load_limit_kg_m2)} kg/m²{" "}
                  {t("(typhoon ballast excluded)", "（未計颱風壓重）")}
                </p>
              )}
              {screen?.warnings?.includes("village_house_area") && (
                <p className="warning-line">
                  {t(
                    "Entered area exceeds the 65.03 m² village-house scope. These preliminary checks may not apply.",
                    "輸入面積超出 65.03 m² 村屋適用範圍，這些初步檢查可能不適用。",
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="detail-panels">
          <details className="assumptions-panel">
            <summary>
              <span>{t("Assumptions & sources", "假設與來源")}</span>
              <small>
                {t(
                  "The fixed values behind the result",
                  "看看結果背後的固定假設",
                )}
              </small>
            </summary>
            <Assumptions zh={zh} t={t} calibration={meta.data?.calibration} />
          </details>
          <details className="evidence-panel">
            <summary>
              <span>{t("Evidence & sensitivity", "證據與敏感性")}</span>
              <small>
                {t(
                  "Model checks and what could change the conclusion",
                  "模型核對，以及甚麼會改變結論",
                )}
              </small>
            </summary>
            {(meta.error || validation.error) && (
              <p className="error-notice" role="alert">
                {t(
                  "Some evidence could not be loaded. Retry to view the source calculations.",
                  "部分證據未能載入，請重試以查看來源計算。",
                )}
                <button onClick={() => setRetry((v) => v + 1)}>
                  {t("Retry evidence", "重試證據")}
                </button>
              </p>
            )}
            <Evidence
              calibration={meta.data?.calibration}
              monthlyComparison={screen?.monthly_comparison}
              validation={validation.data}
              analysis={analysis}
              loading={analysisLoading}
              error={analysisError}
              onAnalyse={analyse}
              t={t}
              interval={recommendedInterval}
              exploring={r && !screen.is_recommended}
            />
          </details>
        </div>
        <div className="file-actions">
          <button
            disabled={!ready}
            onClick={() => downloadOwner(inputs, VERSION)}
          >
            <ArrowDownToLine size={15} />
            {t("Export 7 inputs", "匯出 7 項輸入")}
          </button>
          <button
            disabled={importing}
            onClick={() => importRef.current?.click()}
          >
            <ArrowUpFromLine size={15} />
            {importing
              ? t("Importing…", "正在匯入…")
              : t("Import JSON", "匯入 JSON")}
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label={t("Import inputs file", "匯入輸入檔案")}
            onChange={importFile}
          />
          <button
            disabled={!ready}
            onClick={() =>
              downloadOwnerReport(screen, analysis, assumptions, zh)
            }
          >
            <ArrowDownToLine size={15} />
            {t("Download report", "下載報告")}
          </button>
          <span>
            {t("Inputs are saved on this browser.", "輸入會儲存在這個瀏覽器。")}
          </span>
        </div>
      </main>
      <footer>
        <strong>RoofSun HK</strong>
        <span>
          {t(
            "Preliminary screening before contacting an installer. Simulated results are not engineering design or financial advice.",
            "聯絡安裝商前的初步篩選。結果屬模擬，並非工程設計或財務建議。",
          )}
        </span>
        <small>v{VERSION}</small>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
