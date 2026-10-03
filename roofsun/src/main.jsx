import React, {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import {
  Sun,
  ArrowUpRight,
  ArrowRight,
  RotateCcw,
  Check,
  SlidersHorizontal,
  Layers,
  MoveUpRight,
  Info,
  Leaf,
  Zap,
  Coins,
  ShieldCheck,
  ExternalLink,
  LoaderCircle,
  AlertTriangle,
  ChevronDown,
  Bookmark,
  X,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
  ScatterChart,
  Scatter,
} from "recharts";
import "./style.css";
import { useApi } from "./lib/api.js";
import { fmt, money } from "./lib/format.js";
import { NumberField, Slider, Pill } from "./components/Controls.jsx";
import RoofScene from "./components/RoofScene.jsx";
import Horizon from "./components/Horizon.jsx";
import {
  DecisionControls,
  DecisionBanner,
  TradeoffSummary,
  EngineeringControls,
} from "./components/Decision.jsx";
import {
  readWorkspace,
  persistWorkspace,
  buildArchive,
  restoreArchive,
  downloadArchive,
  downloadReport,
} from "./lib/workspace.js";
const Validation = lazy(() => import("./components/Validation.jsx"));
const Evidence = lazy(() => import("./components/Evidence.jsx"));

const defaults = {
  width: 8,
  depth: 6,
  roof_rotation: 0,
  house_area: 80,
  horizon: Array(12).fill(0),
  price_per_kw: 14000,
  fixed_cost: 640,
  annual_om: 300,
  inverter_cost: 5000,
  commissioning: "2027-01-01",
  post_fit: false,
  self_use_rate: 1.4,
  self_use_share: 0.5,
  budget: 0,
  max_payback_years: 7,
  require_profit: true,
  discount_rate: 0.04,
  cost_inflation: 0,
  weather_year: 2025,
  weather_scale: 1,
  extra_mass_per_module: 0,
  load_limit: 150,
  finite_rows: true,
  electrical_model: "linear",
  bypass_blocks: 3,
  exclusions: [],
  quote_source: "Illustrative assumption; replace with an installer quote",
  quote_date: "",
  panel_source:
    "Generic 450 W engineering reference, not a verified commercial model",
};
const defaultConfig = { tilt: 20, azimuth: 180, rows: 3 };
const presets = [
  { id: "open", en: "Open rooftop", zh: "空曠天台", inputs: { ...defaults } },
  {
    id: "shaded",
    en: "Neighbouring buildings",
    zh: "鄰近樓宇遮擋",
    inputs: {
      ...defaults,
      horizon: [0, 0, 5, 15, 25, 35, 40, 35, 20, 5, 0, 0],
    },
  },
  {
    id: "small",
    en: "Compact rooftop",
    zh: "小型天台",
    inputs: {
      ...defaults,
      width: 5,
      depth: 5,
      house_area: 50,
      horizon: [0, 0, 0, 5, 10, 15, 15, 10, 0, 0, 0, 0],
    },
  },
];

const errorNames = {
  no_space: ["Not enough room for a module", "空間不足以放置面板"],
  overlap: ["Rows overlap or exceed the roof", "排數過多，面板重疊或超出天台"],
  coverage: [
    "Continuous-cover area exceeds the selected limit",
    "連續覆蓋面積超過所選限制",
  ],
  load: [
    "Estimated module, rack and added load exceeds the limit",
    "估算面板、支架及額外荷載超過限制",
  ],
};

function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("roofsun-language") || "en",
  );
  const zh = lang === "zh";
  const t = (en, cn) => (zh ? cn : en);
  const initialWorkspace = useRef(readWorkspace(defaults, defaultConfig));
  const [inputs, setInputs] = useState(initialWorkspace.current.inputs),
    [config, setConfig] = useState(initialWorkspace.current.config),
    [preset, setPreset] = useState("open"),
    [tab, setTab] = useState("design");
  const [day, setDay] = useState("2025-12-21"),
    [hour, setHour] = useState(12),
    [topView, setTopView] = useState(false),
    [saved, setSaved] = useState(initialWorkspace.current.saved);
  const [storageError, setStorageError] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [evidence, setEvidence] = useState(null);
  const importRef = useRef(null);
  const invalidArea = inputs.house_area < inputs.width * inputs.depth;
  const [retry, setRetry] = useState(0);
  const metadata = useApi(`/api/meta?retry=${retry}`, undefined, 0);
  const body = useMemo(() => ({ inputs, config }), [inputs, config]);
  const evaluation = useApi(`/api/evaluate?retry=${retry}`, body, 180),
    simulation = useApi(`/api/simulate?retry=${retry}`, inputs, 550),
    sun = useApi(`/api/sun?retry=${retry}`, { ...body, day, hour }, 90);
  const result = evaluation.data,
    ready = result && !evaluation.loading && !evaluation.error;
  const suggestions = simulation.data?.recommendations;
  const curve =
    result?.cashflow?.filter(
      (point, i, array) =>
        i % 3 === 0 || point.date === "2033-12-31" || i === array.length - 1,
    ) || [];
  const monthly = (result?.monthly_kwh || []).map((kwh, i) => ({
    month: zh
      ? `${i + 1}月`
      : [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ][i],
    kwh,
  }));
  const change = (key, value) => {
    setPreset("custom");
    setInputs((prev) => ({ ...prev, [key]: value }));
  };
  useEffect(() => {
    localStorage.setItem("roofsun-language", lang);
    document.documentElement.lang = zh ? "zh-Hant" : "en";
  }, [lang]);
  useEffect(() => {
    setStorageError(
      persistWorkspace(inputs, config, saved)
        ? ""
        : t(
            "Browser storage is unavailable; export your designs to keep them.",
            "瀏覽器儲存不可用，請匯出設計以保留結果。",
          ),
    );
  }, [inputs, config, saved, lang]);
  const payback = result?.[inputs.post_fit ? "payback_B" : "payback_A"];
  function save() {
    if (!ready) return;
    setSaved((old) => [
      ...old.slice(-1),
      {
        ...result,
        inputs: structuredClone(inputs),
        saved_at: new Date().toISOString(),
        id: crypto.randomUUID(),
      },
    ]);
  }
  const reasonTextUI = (key) =>
    ({
      budget: t("Budget", "預算"),
      profit: t("Profit/NPV", "收益／淨現值"),
      payback: t("Payback", "回本"),
    })[key];
  const archive = () =>
    buildArchive(
      ready ? inputs : saved[0]?.inputs || inputs,
      ready ? config : saved[0]?.config || config,
      ready ? result : saved[0] || null,
      saved,
      metadata.data,
      simulation.loading || simulation.error ? null : simulation.data,
      evidence,
    );
  function exportSaved() {
    downloadArchive(archive());
  }
  async function importPlans(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      const value = await restoreArchive(file, defaults);
      setInputs(value.inputs);
      setConfig(value.config);
      setSaved(value.saved);
      setPreset("custom");
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }
  function compareRows(pair) {
    setSaved(
      pair.map((r, i) => ({
        ...r,
        inputs: structuredClone(inputs),
        saved_at: new Date().toISOString(),
        id: crypto.randomUUID(),
      })),
    );
    document
      .getElementById("saved-plans")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      <header className="site-header">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("design");
          }}
        >
          <span className="brand-symbol">
            <Sun size={24} />
          </span>
          <strong>
            RoofSun<span>HK</span>
          </strong>
        </a>
        <nav aria-label={t("Main navigation", "主導覽")}>
          <button
            className={tab === "design" ? "active" : ""}
            onClick={() => setTab("design")}
          >
            {t("Design workbench", "設計工作台")}
          </button>
          <button
            className={tab === "validation" ? "active" : ""}
            onClick={() => setTab("validation")}
          >
            {t("Model & sources", "模型與來源")}
          </button>
        </nav>
        <div className="header-right">
          <span className="reference-tag">
            <span />
            {t(
              `Reference weather ${inputs.weather_year}`,
              `參考氣象 ${inputs.weather_year}`,
            )}
          </span>
          <button
            className="language-button"
            onClick={() => setLang(zh ? "en" : "zh")}
          >
            {zh ? "EN" : "繁中"}
          </button>
        </div>
      </header>
      {tab === "validation" ? (
        <Suspense
          fallback={
            <p className="loading-page">
              {t("Loading model evidence…", "正在載入模型證據…")}
            </p>
          }
        >
          <Validation t={t} />
        </Suspense>
      ) : (
        <main className="workbench">
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">
                {t("YOUR ROOF. YOUR OPTIONS.", "探索你的天台方案")}
              </span>
              <h1>
                {t(
                  "Find a better place for the sun.",
                  "找出更合適的太陽能擺法。",
                )}
              </h1>
              <p>
                {t(
                  "Explore the layout. See the shade. Compare the return.",
                  "探索排布，觀察遮擋，比較投資結果。",
                )}
              </p>
            </div>
            <div className="case-picker">
              <span>{t("ROOFTOP SCENARIO", "天台情景")}</span>
              <select
                aria-label={t("Rooftop scenario", "天台情景")}
                value={preset}
                onChange={(e) => {
                  const p = presets.find((p) => p.id === e.target.value);
                  if (p) {
                    setPreset(p.id);
                    setInputs(structuredClone(p.inputs));
                    setConfig({
                      ...defaultConfig,
                      rows: p.id === "small" ? 2 : 3,
                    });
                  }
                }}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.en, p.zh)}
                  </option>
                ))}
                <option value="custom" disabled>
                  {t("Custom rooftop", "自訂天台")}
                </option>
              </select>
              <small>
                {t(
                  "Illustrative inputs · actual model calculations",
                  "示例輸入 · 真實模型計算",
                )}
              </small>
            </div>
          </div>
          <DecisionBanner
            result={ready ? result : null}
            search={
              simulation.loading || simulation.error ? null : simulation.data
            }
            loading={evaluation.loading}
            t={t}
            onJump={() =>
              document
                .getElementById("choices")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          />
          <DecisionControls inputs={inputs} change={change} t={t} />
          {invalidArea && (
            <p role="alert" className="error-banner">
              {t(
                "Available roof area exceeds the house covered area. Confirm and edit the house area; it has not been changed automatically.",
                "可用天台面積超過屋宇有蓋面積。請核實並修改有蓋面積，系統沒有自動更改。",
              )}
            </p>
          )}
          {(storageError || importError) && (
            <p role="alert" className="error-banner">
              {storageError || importError}
            </p>
          )}
          <div className="main-grid">
            <aside className="input-panel card">
              <div className="card-title">
                <SlidersHorizontal size={18} />
                <h2>{t("Set your rooftop", "設定天台")}</h2>
                <button
                  className="icon-button"
                  aria-label={t("Reset all inputs", "重設全部輸入")}
                  onClick={() => {
                    setInputs(structuredClone(defaults));
                    setConfig(defaultConfig);
                    setPreset("open");
                  }}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
              <div className="section-label">
                {t("AVAILABLE ROOF AREA", "可放板區域")}
              </div>
              <div className="field-pair">
                <NumberField
                  label={t("Width", "寬度")}
                  value={inputs.width}
                  min={0.5}
                  max={30}
                  step={0.5}
                  unit="m"
                  onChange={(v) => change("width", v)}
                />
                <NumberField
                  label={t("Depth", "深度")}
                  value={inputs.depth}
                  min={0.5}
                  max={30}
                  step={0.5}
                  unit="m"
                  onChange={(v) => change("depth", v)}
                />
              </div>
              <div className="area-note">
                {fmt(inputs.width * inputs.depth, 1)} m²{" "}
                <span>
                  {t(
                    "available · 0.5 m edge clearance",
                    "可用面積 · 四邊預留 0.5 m",
                  )}
                </span>
              </div>
              <div className="field-pair small-fields">
                <NumberField
                  label={t("Roof rotation", "天台旋轉")}
                  value={inputs.roof_rotation}
                  max={359}
                  unit="°"
                  onChange={(v) => change("roof_rotation", v)}
                />
                <NumberField
                  label={t("House covered area", "屋宇有蓋面積")}
                  value={inputs.house_area}
                  min={1}
                  max={1500}
                  unit="m²"
                  onChange={(v) => change("house_area", v)}
                />
              </div>
              <p className="microcopy">
                {t(
                  "Rotation turns the roof’s north axis clockwise. House area includes the whole building, not only the usable roof.",
                  "旋轉角以天台北軸順時針計算。有蓋面積指整幢屋宇，並非只計可放板區域。",
                )}
              </p>
              <Horizon
                values={inputs.horizon}
                onChange={(v) => change("horizon", v)}
                t={t}
              />
              <div className="input-divider" />
              <div className="section-label">
                {t("SYSTEM QUOTE", "系統報價")}
                <Pill>{t("Assumption", "假設")}</Pill>
              </div>
              <NumberField
                label={t("Installation per kW", "每千瓦安裝費")}
                value={inputs.price_per_kw}
                min={1}
                max={100000}
                step={500}
                unit="HK$"
                onChange={(v) => change("price_per_kw", v)}
              />
              <details className="advanced-finance">
                <summary>
                  {t("Costs & commissioning", "費用與投產日期")}
                  <ChevronDown size={13} />
                </summary>
                <div className="field-pair">
                  <NumberField
                    label={t("Fixed costs", "固定費用")}
                    value={inputs.fixed_cost}
                    max={1000000}
                    onChange={(v) => change("fixed_cost", v)}
                  />
                  <NumberField
                    label={t("Annual maintenance", "每年維護")}
                    value={inputs.annual_om}
                    max={100000}
                    onChange={(v) => change("annual_om", v)}
                  />
                </div>
                <NumberField
                  label={t("Inverter replacement", "逆變器更換費")}
                  value={inputs.inverter_cost}
                  max={100000}
                  onChange={(v) => change("inverter_cost", v)}
                />
                <label className="date-label">
                  {t("Commissioning date", "投產日期")}
                  <input
                    aria-label={t("Commissioning date", "投產日期")}
                    type="date"
                    min="2026-01-01"
                    max="2033-12-31"
                    value={inputs.commissioning}
                    onChange={(e) => {
                      if (e.target.value)
                        change("commissioning", e.target.value);
                    }}
                  />
                </label>
              </details>
              <EngineeringControls inputs={inputs} change={change} t={t} />
              <div className="reference-module">
                <Layers size={17} />
                <div>
                  <strong>
                    {t("450 W reference module", "450 W 參考面板")}
                  </strong>
                  <span>
                    1.762 × 1.134 m · {t("assumed specification", "規格為假設")}
                  </span>
                </div>
              </div>
            </aside>
            <section className="scene-panel card">
              <div className="scene-toolbar">
                <div>
                  <span className="section-label">
                    {t("LAYOUT EXPLORER", "排布探索")}
                  </span>
                  <h2>
                    {t(
                      "A little tilt changes a lot.",
                      "角度改變，結果也改變。",
                    )}
                  </h2>
                </div>
                <div className="view-toggle">
                  <button
                    className={!topView ? "active" : ""}
                    onClick={() => setTopView(false)}
                  >
                    {t("Perspective", "立體")}
                  </button>
                  <button
                    className={topView ? "active" : ""}
                    onClick={() => setTopView(true)}
                  >
                    {t("Top view", "俯視")}
                  </button>
                </div>
              </div>
              <div className="scene-wrapper">
                <div className="scene-status">
                  <Pill kind={sun.data?.beam_clear ? "sunny" : "shade"}>
                    <Sun size={12} />
                    {sun.data?.beam_clear
                      ? t("Direct sun", "直射陽光")
                      : t("Shaded / night", "遮擋／夜間")}
                  </Pill>
                  <span>
                    {fmt(sun.data?.altitude, 1)}°{" "}
                    {t("sun elevation", "太陽高度")}
                  </span>
                </div>
                <RoofScene
                  inputs={inputs}
                  config={config}
                  result={ready ? result : null}
                  sun={sun.loading ? null : sun.data}
                  t={t}
                  topView={topView}
                />
                {evaluation.loading && (
                  <div className="scene-loading">
                    <LoaderCircle size={20} className="spin" />
                    {t("Calculating layout…", "正在計算排布…")}
                  </div>
                )}
              </div>
              <div className="time-controls">
                <Sun size={18} />
                <select
                  aria-label={t("Season date", "季節日期")}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                >
                  <option value="2025-03-20">
                    {t("Spring equinox", "春分")}
                  </option>
                  <option value="2025-06-21">
                    {t("Summer solstice", "夏至")}
                  </option>
                  <option value="2025-09-22">
                    {t("Autumn equinox", "秋分")}
                  </option>
                  <option value="2025-12-21">
                    {t("Winter solstice", "冬至")}
                  </option>
                </select>
                <input
                  aria-label={t("Time of day", "一天中的時間")}
                  type="range"
                  min="6"
                  max="18"
                  step=".25"
                  value={hour}
                  onChange={(e) => setHour(+e.target.value)}
                />
                <strong>
                  {String(Math.floor(hour)).padStart(2, "0")}:
                  {String(Math.round((hour % 1) * 60)).padStart(2, "0")}
                </strong>
              </div>
              <p className="scene-caption">
                {t(
                  `Hong Kong time · 2025 seasonal geometry preview · annual results use ${inputs.weather_year} weather (${inputs.weather_year === 2024 ? "8,784" : "8,760"} hours)`,
                  `香港時間 · 2025 年季節幾何示意 · 全年結果採 ${inputs.weather_year} 年氣象（${inputs.weather_year === 2024 ? "8,784" : "8,760"} 小時）`,
                )}
              </p>
              <div className="design-controls">
                <Slider
                  id="tilt"
                  label={t("Panel tilt", "面板傾角")}
                  value={config.tilt}
                  min={0}
                  max={40}
                  step={5}
                  unit="°"
                  onChange={(v) => setConfig((c) => ({ ...c, tilt: v }))}
                />
                <Slider
                  id="azimuth"
                  label={t("Panel direction", "面板朝向")}
                  value={config.azimuth}
                  min={90}
                  max={270}
                  step={15}
                  unit="°"
                  onChange={(v) => setConfig((c) => ({ ...c, azimuth: v }))}
                />
                <Slider
                  id="rows"
                  label={t("Rows", "排數")}
                  value={config.rows}
                  min={1}
                  max={Math.max(
                    6,
                    simulation.data?.search_scope?.rows_limit || 6,
                    config.rows,
                  )}
                  onChange={(v) => setConfig((c) => ({ ...c, rows: v }))}
                />
              </div>
              <div className="scene-bottom">
                <span>
                  <Info size={13} />
                  {t(
                    "South = 180°. More rows can increase mutual shading.",
                    "正南為 180°。增加排數可能加劇互相遮擋。",
                  )}
                </span>
                <button
                  className="text-button"
                  disabled={!ready}
                  onClick={save}
                >
                  <Bookmark size={14} />
                  {t("Save for comparison", "儲存並比較")}
                </button>
              </div>
            </section>
            <aside className="result-panel">
              <section className="yield-card">
                <div className="section-label">
                  {t("YOUR ANNUAL GENERATION", "預計全年發電量")}
                  <Zap size={18} />
                </div>
                <div className="hero-number">
                  {ready ? fmt(result.annual_kwh) : "—"}
                  <span>kWh</span>
                </div>
                <p>
                  {t(
                    `Based on ${inputs.weather_year} reference weather`,
                    `基於 ${inputs.weather_year} 年參考氣象資料`,
                  )}
                </p>
                <div className="yield-stats">
                  <div>
                    <strong>{ready ? result.panels_count : "—"}</strong>
                    <span>{t("modules", "塊面板")}</span>
                  </div>
                  <div>
                    <strong>
                      {ready ? fmt(result.capacity_kw, 2) : "—"}
                      <small> kW</small>
                    </strong>
                    <span>{t("installed capacity", "裝機容量")}</span>
                  </div>
                </div>
                <div className="loss-meter">
                  <span>
                    {t("Estimated shade loss", "估算遮擋損失")}
                    <strong>
                      {ready ? fmt(result.shading_loss_pct, 1) : "—"}%
                    </strong>
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${ready ? Math.min(100, result.shading_loss_pct) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </section>
              <section className="card finance-card">
                <div className="card-title">
                  <Coins size={17} />
                  <h2>{t("Investment outlook", "投資結果")}</h2>
                </div>
                <div className="finance-line">
                  <span>{t("Initial investment", "初始投資")}</span>
                  <strong>{ready ? money(result.initial_cost) : "—"}</strong>
                </div>
                <div className="finance-line">
                  <span>{t("FiT rate / kWh", "上網電價／度")}</span>
                  <strong>{ready ? `HK$ ${result.fit_rate}` : "—"}</strong>
                </div>
                <div className="payback">
                  <span>{t("First break-even", "首次回本")}</span>
                  <strong>
                    {ready
                      ? payback
                        ? payback.slice(0, 7)
                        : t("Not within 25 years", "25 年內未回本")
                      : "—"}
                  </strong>
                </div>
                <div className="finance-line">
                  <span>{t("Sustained break-even", "持續回本")}</span>
                  <strong>
                    {ready
                      ? result[
                          inputs.post_fit
                            ? "stable_payback_B"
                            : "stable_payback_A"
                        ]?.slice(0, 7) || t("Not within life", "壽命內未達成")
                      : "—"}
                  </strong>
                </div>
                <div className="finance-line">
                  <span>
                    {t("NPV at selected discount rate", "所選折現率淨現值")}
                  </span>
                  <strong>
                    {ready
                      ? money(result[inputs.post_fit ? "npv_B" : "npv_A"])
                      : "—"}
                  </strong>
                </div>
                <div className="finance-line">
                  <span>
                    {t("Net cash flow to FiT end", "計劃結束時淨現金流")}
                  </span>
                  <strong>{ready ? money(result.net_to_fit_end) : "—"}</strong>
                </div>
                <label className="scenario-switch">
                  <input
                    type="checkbox"
                    checked={inputs.post_fit}
                    onChange={(e) => change("post_fit", e.target.checked)}
                  />
                  <span>
                    {t("Include self-use after 2033", "計入 2033 年後自用情景")}
                  </span>
                </label>
                {inputs.post_fit && (
                  <div className="field-pair">
                    <NumberField
                      label={t("Avoided tariff HK$/kWh", "抵消電價 HK$/度")}
                      value={inputs.self_use_rate}
                      max={5}
                      step={0.1}
                      onChange={(v) => change("self_use_rate", v)}
                    />
                    <NumberField
                      label={t("Self-used share", "自用比例")}
                      value={inputs.self_use_share}
                      max={1}
                      step={0.1}
                      onChange={(v) => change("self_use_share", v)}
                    />
                  </div>
                )}
                <p className="microcopy">
                  {inputs.post_fit
                    ? t(
                        "Self-use is an assumption, dependent on actual demand and electrical arrangements.",
                        "自用屬假設，取決於實際需求及電力安排。",
                      )
                    : t(
                        "Conservative scenario: no income after the FiT scheme ends.",
                        "保守情景：上網電價計劃結束後不計收入。",
                      )}
                </p>
                <div className="finance-line">
                  <span>{t("25-year net cash flow", "25 年淨現金流")}</span>
                  <strong
                    className={
                      ready &&
                      (inputs.post_fit ? result.net_B : result.net_A) < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    {ready
                      ? money(inputs.post_fit ? result.net_B : result.net_A)
                      : "—"}
                  </strong>
                </div>
              </section>
              <section className="card checks-card">
                <div className="card-title">
                  <ShieldCheck size={17} />
                  <h2>{t("Preliminary checks", "初步條件檢查")}</h2>
                </div>
                {ready && (
                  <>
                    <div className="constraint">
                      <span>{t("Continuous-cover area", "連續覆蓋面積")}</span>
                      <strong>
                        {fmt(result.coverage_m2, 1)} /{" "}
                        {fmt(result.coverage_limit_m2, 1)} m²
                      </strong>
                    </div>
                    <div className="constraint">
                      <span>{t("Module + rack load", "面板＋支架荷載")}</span>
                      <strong>
                        {fmt(result.load_kg_m2, 1)} /{" "}
                        {fmt(result.load_limit_kg_m2)} kg/m²
                      </strong>
                    </div>
                    <Pill kind={result.compliant ? "success" : "warning"}>
                      {result.compliant ? (
                        <Check size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}{" "}
                      {result.compliant
                        ? t("Selected checks passed", "通過所選條件檢查")
                        : t("Configuration needs adjustment", "配置需要調整")}
                    </Pill>
                    {result.violations.map((v) => (
                      <p className="violation" key={v}>
                        {t(...(errorNames[v] || [v, v]))}
                      </p>
                    ))}
                  </>
                )}
                <p className="microcopy">
                  {t(
                    "Includes spacing, coverage and assumed module/rack plus user-added weight. Wind forces, support/fixing design and structural safety are not assessed.",
                    "包含間距、覆蓋、假設面板／支架及額外重量。未評估風力、支承／固定設計及結構安全。",
                  )}
                </p>
              </section>
            </aside>
          </div>
          {(evaluation.error ||
            simulation.error ||
            sun.error ||
            metadata.error) && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={17} />
              <span>
                {t(
                  "Could not calculate. Check inputs or ensure the local API is running.",
                  "無法計算，請檢查輸入或確認本機 API 正在運行。",
                )}{" "}
                {evaluation.error ||
                  simulation.error ||
                  sun.error ||
                  metadata.error}
              </span>
              <button onClick={() => setRetry((r) => r + 1)}>
                {t("Retry", "重試")}
              </button>
            </div>
          )}
          <TradeoffSummary
            result={ready ? result : null}
            t={t}
            onCompare={compareRows}
          />
          <section className="recommendation-section" id="choices">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {t("COMPARE YOUR OPTIONS", "比較不同選擇")}
                </span>
                <h2>
                  {t("One roof. Different priorities.", "同一天台，不同取捨。")}
                </h2>
              </div>
              <span className="search-status">
                {simulation.loading ? (
                  <>
                    <LoaderCircle className="spin" size={14} />
                    {t(
                      "Searching and refining configurations…",
                      "正在搜尋及細化配置…",
                    )}
                  </>
                ) : (
                  `${simulation.data?.tested || 0} ${t("tested", "個已測試")} · ${simulation.data?.configs.length || 0} ${t("physically feasible", "個物理可行")} · ${simulation.data?.eligible_count || 0} ${t("meet goals", "個達標")}`
                )}
              </span>
            </div>
            <div className="recommendation-grid">
              {[
                ["economy", "Lower investment", "較低投入", Coins],
                ["balanced", "Balanced choice", "折中選擇", Leaf],
                ["generation", "More generation", "較高發電量", Zap],
              ].map(([key, en, cn, Icon]) => {
                const r = suggestions?.[key];
                return (
                  <button
                    key={key}
                    className={`recommendation ${key === "balanced" ? "featured" : ""}`}
                    disabled={!r || simulation.loading || !!simulation.error}
                    onClick={() => setConfig(r.config)}
                  >
                    <div className="recommendation-title">
                      <Icon size={19} />
                      <span>{t(en, cn)}</span>
                      <ArrowUpRight size={17} />
                    </div>
                    <div className="recommendation-values">
                      <strong>
                        {r && !simulation.loading ? fmt(r.annual_kwh) : "—"}
                        <small> kWh / {t("yr", "年")}</small>
                      </strong>
                      <span>
                        {r && !simulation.loading ? money(r.initial_cost) : "—"}
                      </span>
                    </div>
                    <p>
                      {r && !simulation.loading
                        ? `${r.panels_count} ${t("modules", "塊面板")} · ${r.config.tilt}° · ${r.config.azimuth}° · ${r.config.rows} ${t("rows", "排")}`
                        : simulation.loading
                          ? t("Calculating…", "正在計算…")
                          : t("No feasible configuration", "沒有可行配置")}
                    </p>
                    {r && !simulation.loading && (
                      <p className="choice-reason">
                        {key === "economy"
                          ? t(
                              "Lowest investment among designs meeting your goals.",
                              "達標方案中初始投資最低。",
                            )
                          : key === "generation"
                            ? t(
                                "Most energy among designs meeting your goals.",
                                "達標方案中發電最多。",
                              )
                            : t(
                                "Closest to equal-weight cost/energy ideal among eligible frontier choices.",
                                "達標前沿方案中，最接近成本／發電等權理想點。",
                              )}
                      </p>
                    )}
                    {r && !simulation.loading && (
                      <p className="choice-details">
                        {t("NPV", "淨現值")} {money(r.reason_details.npv)} ·{" "}
                        {t("Sustained payback", "持續回本")}{" "}
                        {r.reason_details.stable_payback?.slice(0, 7) || "—"}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="no-install-option">
              <strong>{t("Baseline: do not install", "基準：不安裝")}</strong>
              <span>
                HK$0 · 0 kWh/{t("yr", "年")} · {t("solar NPV", "太陽能淨現值")}{" "}
                HK$0
              </span>
              <p>
                {t(
                  "Avoid solar investment and solar revenue. If no design meets your goals, defer installation or review the assumptions. Non-financial goals can be explored by disabling financial requirements.",
                  "沒有太陽能投資或收益。若無方案達標，可暫緩安裝或核對假設。可關閉財務要求，以探索其他目標。",
                )}
              </p>
            </div>
            {simulation.data && !simulation.loading && (
              <p className="microcopy">
                {t("Rejected goals", "未達目標")}:{" "}
                {Object.entries(simulation.data.rejection_counts)
                  .map(([key, value]) => `${reasonTextUI(key)} ${value}`)
                  .join(" · ")}{" "}
                ·{" "}
                {t(
                  "Overlapping counts; one design may fail several goals.",
                  "計數可重複，一個方案可能未達多個目標。",
                )}
              </p>
            )}
            <p className="microcopy recommendation-note">
              {t(
                "Budget and financial goals filter the choices first. The equal-weight balanced criterion is a preference, not a financial optimum. Coarse search plus local refinement, equally spaced rows and southward orientations only; not a global optimum. North-facing arrays, grouped installation and irregular roofs are outside the search.",
                "先按預算及財務目標篩選，再選取推薦。等權折中屬偏好，並非財務最優。採粗搜尋加局部細化、等間距排及南向範圍，不能保證全局最優；未搜尋北向、群組安裝及不規則屋頂。",
              )}
            </p>
          </section>
          <div className="charts-grid">
            <section className="card chart-card">
              <div className="card-title">
                <h2>{t("Generation through the year", "全年發電分布")}</h2>
                <span>kWh</span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ready ? monthly : []}
                    margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e9df"
                    />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#73806c" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#73806c" }}
                    />
                    <Tooltip
                      formatter={(n) => [
                        `${fmt(n)} kWh`,
                        t("Generation", "發電量"),
                      ]}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="kwh"
                      fill="#507a5b"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card chart-card">
              <div className="card-title">
                <h2>
                  {t("The investment–energy trade-off", "投資與發電量的取捨")}
                </h2>
                <span>{t("Click a point", "點選配置")}</span>
              </div>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e9df" />
                    <XAxis
                      type="number"
                      dataKey="initial_cost"
                      name={t("Investment", "投資")}
                      tickFormatter={(v) => `${fmt(v / 1000)}k`}
                      unit=""
                      tick={{ fontSize: 11 }}
                      label={{
                        value: "HK$",
                        position: "insideBottomRight",
                        offset: -6,
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="annual_kwh"
                      name={t("Generation", "發電量")}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      formatter={(v, name) => [fmt(v), name]}
                    />
                    <Scatter
                      isAnimationActive={false}
                      data={
                        simulation.loading ? [] : simulation.data?.configs || []
                      }
                      fill="#c1ceba"
                      onClick={(p) => setConfig(p.config)}
                    />
                    <Scatter
                      isAnimationActive={false}
                      data={
                        simulation.loading
                          ? []
                          : simulation.data?.frontier || []
                      }
                      fill="#2c5d42"
                      onClick={(p) => setConfig(p.config)}
                    />
                    {!simulation.loading && simulation.data?.no_install && (
                      <Scatter
                        isAnimationActive={false}
                        data={[simulation.data.no_install]}
                        fill="#8a806f"
                        shape="cross"
                      />
                    )}
                    {ready && (
                      <Scatter
                        isAnimationActive={false}
                        data={[result]}
                        fill="#db9c3c"
                      />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="microcopy">
                {t(
                  "Green: trade-off frontier · gold: current design · vertical axis: kWh/year",
                  "綠色：取捨前沿 · 金色：當前配置 · 縱軸：每年 kWh",
                )}
              </p>
            </section>
          </div>
          <section className="card cashflow-card">
            <div className="card-title">
              <h2>
                {t("When does the investment come back?", "投資何時能回本？")}
              </h2>
              <div className="chart-legend">
                <span>
                  <i />
                  {t("No post-FiT income", "上網電價結束後無收入")}
                </span>
                {inputs.post_fit && (
                  <span>
                    <i className="gold" />
                    {t("Self-use scenario", "自用情景")}
                  </span>
                )}
              </div>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ready ? curve : []}
                  margin={{ top: 15, right: 20, left: 15, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="#e5e9df"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(0, 4)}
                    minTickGap={80}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      money(v),
                      name === "A"
                        ? t("No post-FiT income", "計劃結束後無收入")
                        : t("Self-use scenario", "自用情景"),
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#71806a" />
                  <ReferenceLine
                    x="2033-12-31"
                    stroke="#ad8350"
                    strokeDasharray="4 4"
                    label={{
                      value: t("FiT ends", "上網電價結束"),
                      fontSize: 11,
                      position: "insideTopLeft",
                    }}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="A"
                    stroke="#386348"
                    dot={false}
                    strokeWidth={2}
                  />
                  {inputs.post_fit && (
                    <Line
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="B"
                      stroke="#bc934e"
                      dot={false}
                      strokeWidth={2}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="microcopy">
              {t(
                "HK$ · 25-year simple cash flow · replacement cost included at year 10 · break-even is the first nonnegative month, not a guarantee of staying positive.",
                "港元 · 25 年簡單現金流 · 第 10 年計入更換費用 · 回本指首次非負月份，不代表其後一直為正。",
              )}
            </p>
          </section>
          <Suspense
            fallback={
              <p>{t("Loading sensitivity tools…", "正在載入敏感性工具…")}</p>
            }
          >
            <Evidence
              inputs={inputs}
              config={config}
              t={t}
              onEvidence={setEvidence}
            />
          </Suspense>
          <section className="card saved-card" id="saved-plans">
            <div className="card-title">
              <h2>{t("Your side-by-side comparison", "並排比較你的方案")}</h2>
              <button
                className="text-button"
                onClick={exportSaved}
                disabled={
                  (!ready && !saved.length) ||
                  !metadata.data ||
                  metadata.loading ||
                  !!metadata.error
                }
              >
                <Download size={14} />
                {t("Export JSON", "匯出 JSON")}
              </button>
              <button
                className="text-button"
                disabled={
                  !ready ||
                  !metadata.data ||
                  metadata.loading ||
                  !!metadata.error
                }
                onClick={() => downloadReport(archive(), lang === "zh")}
              >
                {t("Download report", "下載報告")}
              </button>
              <button
                className="text-button"
                onClick={() => importRef.current?.click()}
                disabled={importing}
              >
                {importing
                  ? t("Recalculating…", "正在重新計算…")
                  : t("Import JSON", "載入 JSON")}
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                aria-label={t("Import design file", "載入設計檔案")}
                hidden
                onChange={importPlans}
              />
            </div>
            <p className="microcopy">
              {t(
                "Design inputs and saved A/B plans persist on this browser. Imports are recalculated with the current model; exported results are never trusted as new calculations.",
                "設計輸入及 A/B 方案會保存在本瀏覽器。載入時會用當前模型重新計算，不直接採信匯出檔案的舊結果。",
              )}
            </p>
            {!saved.length ? (
              <div className="empty-comparison">
                <Bookmark size={22} />
                <p>
                  {t(
                    "Save two layouts to compare their generation, cost and shading losses.",
                    "儲存兩個排布，比較發電量、成本與遮擋損失。",
                  )}
                </p>
              </div>
            ) : (
              <div className="saved-grid">
                {saved.map((r, i) => (
                  <div
                    key={r.id || `${r.saved_at}-${i}`}
                    className="saved-plan"
                  >
                    <div className="saved-plan-title">
                      <strong>
                        {t("Plan", "方案")} {i === 0 ? "A" : "B"}
                      </strong>
                      <button
                        className="icon-button"
                        aria-label={t("Remove saved plan", "移除已儲存方案")}
                        onClick={() =>
                          setSaved((old) => old.filter((_, j) => j !== i))
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p>
                      {r.config.tilt}° · {r.config.azimuth}° · {r.config.rows}{" "}
                      {t("rows", "排")} · {r.inputs.width} × {r.inputs.depth} m
                    </p>
                    <dl>
                      <dt>{t("Annual generation", "全年發電")}</dt>
                      <dd>{fmt(r.annual_kwh)} kWh</dd>
                      <dt>{t("Investment", "投資")}</dt>
                      <dd>{money(r.initial_cost)}</dd>
                      <dt>{t("Specific yield", "單位容量發電")}</dt>
                      <dd>{fmt(r.specific_yield, 1)} kWh/kW</dd>
                      <dt>{t("NPV", "淨現值")}</dt>
                      <dd>{money(r[r.inputs.post_fit ? "npv_B" : "npv_A"])}</dd>
                      <dt>{t("Sustained break-even", "持續回本")}</dt>
                      <dd>
                        {r[
                          r.inputs.post_fit
                            ? "stable_payback_B"
                            : "stable_payback_A"
                        ]?.slice(0, 7) || t("Not within life", "壽命內未達成")}
                      </dd>
                      <dt>{t("Shade loss", "遮擋損失")}</dt>
                      <dd>{fmt(r.shading_loss_pct, 1)}%</dd>
                      <dt>{t("First break-even", "首次回本")}</dt>
                      <dd>
                        {r[
                          r.inputs.post_fit ? "payback_B" : "payback_A"
                        ]?.slice(0, 7) ||
                          t("Not within life", "壽命期內未回本")}
                      </dd>
                      <dt>{t("Financial scenario", "財務情景")}</dt>
                      <dd>
                        {r.inputs.post_fit
                          ? t("Post-FiT self-use", "計劃後自用")
                          : t("No post-FiT income", "計劃後無收入")}
                      </dd>
                    </dl>
                    <button
                      className="text-button"
                      onClick={() => {
                        setInputs(structuredClone(r.inputs));
                        setConfig(r.config);
                        setPreset("custom");
                      }}
                    >
                      {t("Restore this design", "恢復此設計")}
                      <ArrowRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}
      <footer>
        <span>
          RoofSun HK <span className="footer-dot">·</span>{" "}
          {t("Explore before you install.", "安裝之前，先探索。")}
        </span>
        <p>
          {t(
            "Simulation for preliminary exploration. Results do not replace site surveys, structural design or electrical assessment.",
            "模擬只供初步探索，結果不能代替實地勘察、結構設計或電力評估。",
          )}
        </p>
        <button
          className="text-button"
          onClick={() => {
            setTab("validation");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          {t("Assumptions & sources", "假設與來源")}
          <ArrowUpRight size={13} />
        </button>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
