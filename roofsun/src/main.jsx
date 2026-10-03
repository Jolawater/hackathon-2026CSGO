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
import RoofScene from "./components/RoofScene3D.jsx";
import Welcome from "./components/Welcome.jsx";
import Choices from "./components/Choices.jsx";
import PlanBrief from "./components/PlanBrief.jsx";
import Horizon from "./components/Horizon.jsx";
import OwnerGuide from "./components/OwnerGuide.jsx";
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
import {
  NeighbourInput,
  MountingInput,
  QuoteScreen,
  RadiationEvidence,
  MeasuredReference,
  niceTicks,
} from "./components/Screening.jsx";
const Validation = lazy(() => import("./components/Validation.jsx"));
const Evidence = lazy(() => import("./components/Evidence.jsx"));

import roofPresets from "../data/roof_presets.json";
const defaults = {
  analysis_years: 25,
  monthly_demand_kwh: 0,
  demand_coverage: 1,
  width: 8.06,
  depth: 8.06,
  roof_rotation: 0,
  house_area: 65,
  village_house_mode: true,
  horizon: Array(12).fill(0),
  price_per_kw: 25000,
  fixed_cost: 5000,
  annual_om: 300,
  inverter_cost: 5000,
  commissioning: "2027-01-01",
  post_fit: false,
  self_use_rate: 1.4,
  self_use_share: 0.5,
  minimum_access_gap_m: 0.3,
  minimum_row_fill_ratio: 0.7,
  minimum_capacity_kw: 2,
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
  exclusions: roofPresets.presets[0].inputs.exclusions,
  quote_source: "Illustrative assumption; replace with an installer quote",
  quote_date: "",
  panel_source:
    "Generic 450 W engineering reference, not a verified commercial model",
};
const defaultConfig = roofPresets.presets[0].config;
const presets = roofPresets.presets.map((p) => ({
  ...p,
  inputs: { ...defaults, ...p.inputs },
}));

const errorNames = {
  placement_invalid: [
    "Panels hit the roof edge or an object; reset placement",
    "面板碰到天台邊界或物件，請還原位置",
  ],
  no_space: ["Not enough room for a module", "空間不足以放置面板"],
  rows_unbuildable: [
    "Requested row count or assumed row density cannot be achieved",
    "未能達到要求排數或假設的每排板數密度",
  ],
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
    [preset, setPreset] = useState(
      () =>
        presets.find(
          (p) =>
            JSON.stringify(p.inputs) ===
            JSON.stringify(initialWorkspace.current.inputs),
        )?.id || "custom",
    ),
    [tab, setTab] = useState("design");
  const [entry, setEntry] = useState(
    () => sessionStorage.getItem("roofsun-entry") || "",
  );
  const [confirmed, setConfirmed] = useState(() => ({
    inputs: structuredClone(initialWorkspace.current.inputs),
    config: structuredClone(initialWorkspace.current.config),
    day: initialWorkspace.current.preview?.day || "2025-12-15",
    hour: initialWorkspace.current.preview?.hour ?? 12,
  }));
  const activeInputs = confirmed.inputs,
    activeConfig = confirmed.config;
  const [day, setDay] = useState(
      initialWorkspace.current.preview?.day || "2025-12-15",
    ),
    [hour, setHour] = useState(initialWorkspace.current.preview?.hour ?? 12),
    [topView, setTopView] = useState(false),
    [saved, setSaved] = useState(initialWorkspace.current.saved);
  const [advanced, setAdvanced] = useState(
    () => localStorage.getItem("roofsun-mode") === "advanced",
  );
  useEffect(() => {
    localStorage.setItem("roofsun-mode", advanced ? "advanced" : "simple");
  }, [advanced]);
  const [fieldReference, setFieldReference] = useState(null);
  const [resetCount, setResetCount] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const importRef = useRef(null);
  const invalidArea = inputs.house_area + 1e-8 < inputs.width * inputs.depth;
  const [retry, setRetry] = useState(0);
  const metadata = useApi(`/api/meta?retry=${retry}`, undefined, 0);
  const pending =
    JSON.stringify({ inputs, config, day, hour }) !==
      JSON.stringify(confirmed) || pendingImport !== null;
  const body = useMemo(
    () => ({ inputs: activeInputs, config: activeConfig }),
    [confirmed],
  );
  function confirmChanges() {
    setConfirmed(structuredClone({ inputs, config, day, hour }));
    if (pendingImport !== null) {
      setSaved(pendingImport);
      setPendingImport(null);
    }
    setFieldReference(null);
    setEvidence(null);
  }
  function cancelChanges() {
    setPendingImport(null);
    setInputs(structuredClone(activeInputs));
    setConfig(structuredClone(activeConfig));
    setDay(confirmed.day);
    setHour(confirmed.hour);
  }
  function start(mode, roof) {
    setEntry(mode);
    sessionStorage.setItem("roofsun-entry", mode);
    if (mode === "demo") {
      const next = structuredClone(defaults);
      setInputs(next);
      setConfig(defaultConfig);
      setConfirmed({
        inputs: next,
        config: defaultConfig,
        day: "2025-12-15",
        hour: 12,
      });
      setDay("2025-12-15");
      setHour(12);
      setPreset(presets[0].id);
      setPendingImport(null);
    }
    if (roof) {
      const next = {
        ...defaults,
        width: +roof.width,
        depth: +roof.depth,
        house_area: +roof.width * +roof.depth,
        price_per_kw: +roof.price,
        commissioning: roof.date,
        exclusions: [],
        quote_source: "User-entered initial quote",
      };
      setInputs(next);
      setConfig(defaultConfig);
      setConfirmed({ inputs: next, config: defaultConfig, day, hour });
      setPreset("custom");
    }
  }
  const evaluation = useApi(`/api/evaluate?retry=${retry}`, body, 180, !!entry),
    simulation = useApi(
      `/api/simulate?retry=${retry}`,
      activeInputs,
      550,
      !!entry,
    ),
    sun = useApi(
      `/api/sun?retry=${retry}`,
      { ...body, day: confirmed.day, hour: confirmed.hour },
      90,
      !!entry,
    );
  const result = evaluation.data,
    ready = result && !evaluation.loading && !evaluation.error;
  const [sceneSnapshot, setSceneSnapshot] = useState(null);
  useEffect(() => {
    if (ready && !sun.loading && !sun.error && sun.data)
      setSceneSnapshot({
        inputs: activeInputs,
        config: activeConfig,
        result,
        sun: sun.data,
      });
  }, [ready, result, sun.loading, sun.error, sun.data, confirmed]);
  const [previewHour, setPreviewHour] = useState(12),
    [playing, setPlaying] = useState(false),
    [playSpeed, setPlaySpeed] = useState(1);
  const track = useApi(
    "/api/sun-track",
    {
      inputs: sceneSnapshot?.inputs || activeInputs,
      config: sceneSnapshot?.config || activeConfig,
      day: confirmed.day,
    },
    100,
    !!entry,
  );
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(),
      frame;
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.2);
      last = now;
      setPreviewHour((h) => (h + dt * playSpeed) % 24);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, playSpeed]);
  const displaySun = useMemo(() => {
    const samples = track.data?.samples;
    if (!samples?.length) return sceneSnapshot?.sun;
    const step = Math.min(95, Math.floor(previewHour * 4)),
      k = (previewHour - step / 4) * 4,
      a = samples[step],
      b = samples[step + 1];
    const altitude = a.altitude + (b.altitude - a.altitude) * k,
      azimuth =
        (a.azimuth + (((b.azimuth - a.azimuth + 540) % 360) - 180) * k + 360) %
        360,
      horizon = a.horizon + (b.horizon - a.horizon) * k;
    return {
      altitude,
      azimuth,
      horizon,
      beam_clear: altitude > horizon,
      row_shade: [],
    };
  }, [track.data, previewHour, sceneSnapshot]);
  const suggestions = simulation.data?.recommendations;
  const curve =
    result?.cashflow?.filter(
      (point, i, array) =>
        i % 3 === 0 || point.date === "2033-12-31" || i === array.length - 1,
    ) || [];
  const cashTicks = niceTicks(
    curve.map((p) => (activeInputs.post_fit ? p : { A: p.A, B: p.A })),
  );
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
      persistWorkspace(activeInputs, activeConfig, saved, {
        day: confirmed.day,
        hour: confirmed.hour,
      })
        ? ""
        : t(
            "Browser storage is unavailable; export your designs to keep them.",
            "瀏覽器儲存不可用，請匯出設計以保留結果。",
          ),
    );
  }, [confirmed, saved, lang]);
  const payback = result?.[activeInputs.post_fit ? "payback_B" : "payback_A"];
  function save() {
    if (!ready) return;
    setSaved((old) => [
      ...old.slice(-1),
      {
        ...result,
        inputs: structuredClone(activeInputs),
        saved_at: new Date().toISOString(),
        id: crypto.randomUUID(),
      },
    ]);
  }
  const reasonTextUI = (key) =>
    ({
      budget: t("Budget", "預算"),
      energy_target: t("Electricity target", "發電目標"),
      profit: t("Profit/NPV", "收益／淨現值"),
      payback: t("Payback", "回本"),
      minimum_capacity: t("Minimum capacity", "最小容量"),
    })[key];
  const archive = () => ({
    ...buildArchive(
      ready ? activeInputs : saved[0]?.inputs || activeInputs,
      ready ? activeConfig : saved[0]?.config || activeConfig,
      ready ? result : saved[0] || null,
      saved,
      metadata.data,
      simulation.loading || simulation.error ? null : simulation.data,
      evidence,
      ready &&
        fieldReference?.fingerprint ===
          JSON.stringify({ inputs: activeInputs, config: activeConfig })
        ? fieldReference.data
        : null,
    ),
    preview: { day: confirmed.day, hour: confirmed.hour },
  });
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
      setPendingImport(value.saved);
      if (value.preview) {
        setDay(value.preview.day);
        setHour(value.preview.hour);
      }
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
        inputs: structuredClone(activeInputs),
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
      ) : !entry ? (
        <Welcome t={t} onStart={start} />
      ) : (
        <main className="workbench">
          <div className="confirmation-bar" role="status">
            <div>
              <strong>
                {pending
                  ? t("Changes not applied", "有修改尚未套用")
                  : t("Confirmed settings", "目前已確認的設定")}
              </strong>
              <small>
                {entry === "demo"
                  ? t(
                      "Example inputs · these are not your roof’s results",
                      "示例輸入 · 不代表你家的結果",
                    )
                  : t(
                      "Your inputs + assumptions below; check shading and remaining costs.",
                      "你的輸入＋下方假設；請繼續核對遮擋和其他費用。",
                    )}
                {pending
                  ? " · " +
                    t(
                      "Results still use the last confirmed settings.",
                      "結果仍使用上一次確認的設定。",
                    )
                  : ""}
              </small>
            </div>
            <button onClick={confirmChanges} disabled={!pending || invalidArea}>
              {t("Confirm and keep", "確認並保留")}
            </button>
            <button disabled={!pending} onClick={cancelChanges}>
              {t("Cancel changes", "取消修改")}
            </button>
            <button
              onClick={() => {
                setEntry("");
                sessionStorage.removeItem("roofsun-entry");
              }}
            >
              {t("Start screen", "返回開始")}
            </button>
          </div>
          <div className="workbench-heading">
            <div>
              <span className="eyebrow">
                {t("YOUR ROOF. YOUR OPTIONS.", "探索你的天台方案")}
              </span>
              <h1>
                {t(
                  "Find the right size for your roof.",
                  "替你的天台，找到合適規模。",
                )}
              </h1>
              <p>
                {t(
                  "Compare shade, the 10 kW tariff step, and the quote before 2033.",
                  "比較遮擋、10 kW 電價門檻，以及 2033 年前的安裝價值。",
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
                    setConfig({ ...p.config });
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
                  "Roof, objects and neighbour dimensions are assumed · simulated results",
                  "天台、物件及鄰屋尺寸為假設 · 結果屬模擬",
                )}
              </small>
            </div>
          </div>
          <div className="mode-toggle view-toggle">
            <button
              className={!advanced ? "active" : ""}
              onClick={() => setAdvanced(false)}
            >
              {t("Simple mode", "簡單模式")}
            </button>
            <button
              className={advanced ? "active" : ""}
              onClick={() => setAdvanced(true)}
            >
              {t("Advanced mode", "進階模式")}
            </button>
            <span className="microcopy">
              {t(
                "Roof → shading → quote → decision",
                "天台 → 遮擋 → 報價 → 決策",
              )}
            </span>
          </div>
          <details className="region-guide card">
            <summary>
              {t(
                "Can I use this outside Hong Kong?",
                "內地或海外的天台，可以用嗎？",
              )}
            </summary>
            <p>
              {t(
                "The sunlight and panel physics can be reused, but this edition calculates with Hong Kong weather and HK$ rules. A roof in Beijing, Singapore or London needs its own hourly sunshine, temperature, time zone, tariff, currency and building rules. Changing the building appearance is not regional calibration.",
                "陽光照到面板的物理關係可以沿用，但這一版計算使用香港天氣及港元規則。北京、新加坡或倫敦需要各自逐時的日照、溫度、時區、電價、貨幣與建築規則；換成高樓外觀不等於完成地區校準。",
              )}
            </p>
            <p>
              {t(
                "Outside Hong Kong: use the layout interaction as an illustration only. Energy and payback are still Hong Kong scenarios, not estimates for your location.",
                "香港以外：可以體驗排布互動，但發電與回本仍是香港情景，不能當作當地預測。",
              )}
            </p>
          </details>
          <section className="card everyday-inputs">
            <h2>
              {t("Your budget and electricity goal", "你的預算與用電目標")}
            </h2>
            <div className="everyday-grid">
              <NumberField
                label={t("Installation budget", "最多願意花多少安裝費？")}
                value={inputs.budget}
                max={10000000}
                unit="HK$"
                onChange={(v) => change("budget", v)}
              />
              <NumberField
                label={t("Monthly electricity use", "電費單上每月用多少度電？")}
                value={inputs.monthly_demand_kwh || 0}
                max={100000}
                unit={t("kWh", "度")}
                onChange={(v) => change("monthly_demand_kwh", v)}
              />
              <NumberField
                label={t(
                  "Share to match with solar",
                  "希望太陽能年發電相當於用電的多少？",
                )}
                value={Math.round((inputs.demand_coverage ?? 1) * 100)}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => change("demand_coverage", v / 100)}
              />
            </div>
            <p className="microcopy">
              {t(
                "Budget 0 means no cap; usage 0 means unknown and no energy requirement. Use the kWh on your bill, not the money charged. This compares annual amounts only: panels do not supply electricity at night without storage or the grid.",
                "預算填 0 代表暫不限；用電填 0 代表未知、不加入發電量要求。請填電費單上的「度數」，不是繳費金額。這裡比較全年總量：沒有儲能或電網，太陽能板不能在晚上供電。",
              )}
            </p>
            <details>
              <summary>
                {t(
                  "Which assumptions are still in use?",
                  "還有哪些資料暫時是假設？",
                )}
              </summary>
              <p>
                {t(
                  "The panel specification, roof orientation, neighbour shading, mounting load and maintenance cost need checking. Hidden detailed fields still affect the calculation; open their sections or Advanced mode to review them.",
                  "面板規格、天台方向、鄰屋遮擋、支架重量和維護費仍需核對。收起的詳細欄位仍參與計算，可展開對應設定或進階模式查看。",
                )}
              </p>
            </details>
          </section>
          <PlanBrief
            inputs={activeInputs}
            search={simulation.error ? null : simulation.data}
            loading={simulation.loading}
            pending={pending}
            t={t}
            onChoose={(c) => setConfig(c)}
          />
          <OwnerGuide
            inputs={activeInputs}
            result={ready ? result : null}
            t={t}
            onEvidence={() => {
              setTab("validation");
              window.scrollTo(0, 0);
            }}
            onCompare={() =>
              document
                .getElementById("choices")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          />
          <DecisionBanner
            sample={entry === "demo"}
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
          <details className="goals-details" open={advanced}>
            <summary>
              {t("Budget and screening goals", "預算及篩選目標")}
            </summary>
            <DecisionControls inputs={inputs} change={change} t={t} />
            <NumberField
              label={t(
                "How many years should we compare?",
                "想看未來多少年的收支？",
              )}
              value={inputs.analysis_years || 25}
              min={1}
              max={25}
              unit={t("years", "年")}
              onChange={(v) => change("analysis_years", v)}
            />
            <p className="microcopy">
              {t(
                "Like setting the end of a household account book. If costs are not recovered by then, we say so. Future weather repeats the selected historical year; this is a scenario, not a weather forecast.",
                "就像決定家庭帳簿記到哪一年：到時還沒收回成本，就顯示未回本。未來天氣重複所選歷史年的模式，是情景推算，不是天氣預報。",
              )}
            </p>
          </details>
          {ready && result.warnings?.includes("village_house_area") && (
            <p role="alert" className="error-banner">
              {t(
                "Village-house scope warning: covered area exceeds 65.03 m² (700 sq ft). These preliminary village-house checks may not apply; calculations remain available.",
                "村屋適用範圍提示：有蓋面積超過 65.03 m²（700 平方呎），這些村屋初步檢查可能不適用；仍可進行計算。",
              )}{" "}
              <a href={roofPresets.source_url} target="_blank" rel="noreferrer">
                {t(
                  "Lands Department guide, Part A p.3",
                  "地政總署須知，甲部第 3 頁",
                )}
              </a>
            </p>
          )}
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
                    setImportError("");
                    setFieldReference(null);
                    setResetCount((n) => n + 1);
                    setDay("2025-12-15");
                    setHour(12);
                    setTopView(false);
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
              <details className="technical-details" open={advanced}>
                <summary>
                  {t(
                    "Roof orientation and building details",
                    "天台方向與屋宇細節",
                  )}
                </summary>
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
                <label className="goal-checkbox">
                  <input
                    type="checkbox"
                    checked={inputs.village_house_mode}
                    onChange={(e) =>
                      change("village_house_mode", e.target.checked)
                    }
                  />
                  {t("Village-house screening mode", "村屋初步篩選模式")}
                </label>
              </details>
              <NeighbourInput
                presetGeometry={
                  presets.find((p) => p.id === preset)?.neighbour_geometry
                }
                key={resetCount}
                horizon={inputs.horizon}
                onChange={(v) => change("horizon", v)}
                t={t}
              />
              {advanced && (
                <Horizon
                  values={inputs.horizon}
                  onChange={(v) => change("horizon", v)}
                  t={t}
                />
              )}
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
              <label className="date-label">
                {t("Commissioning date", "投產日期")}
                <input
                  aria-label={t("Commissioning date", "投產日期")}
                  type="date"
                  min="2026-01-01"
                  max="2033-12-31"
                  value={inputs.commissioning}
                  onChange={(e) => {
                    if (e.target.value) change("commissioning", e.target.value);
                  }}
                />
              </label>
              <details className="advanced-finance">
                <summary>
                  {t("Maintenance & other costs", "維護及其他費用")}
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
              </details>
              <details className="technical-details" open={advanced}>
                <summary>
                  {t(
                    "Mounting details — ask your installer",
                    "支架細節 · 可請安裝師傅協助",
                  )}
                </summary>
                <MountingInput inputs={inputs} change={change} t={t} />
              </details>
              {advanced && (
                <EngineeringControls inputs={inputs} change={change} t={t} />
              )}
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
                    {t("More panels. Better value?", "多裝面板，是否更划算？")}
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
                  <Pill kind={displaySun?.beam_clear ? "sunny" : "shade"}>
                    <Sun size={12} />
                    {displaySun?.beam_clear
                      ? t("Direct sun", "直射陽光")
                      : t("Shaded / night", "遮擋／夜間")}
                  </Pill>
                  <span>
                    {fmt(displaySun?.altitude, 1)}°{" "}
                    {t("sun elevation", "太陽高度")}
                  </span>
                </div>
                <RoofScene
                  inputs={sceneSnapshot?.inputs || activeInputs}
                  config={sceneSnapshot?.config || activeConfig}
                  onPlace={(x, y) =>
                    setConfig((c) => ({ ...c, offset_x: x, offset_y: y }))
                  }
                  result={sceneSnapshot?.result || null}
                  sun={sceneSnapshot?.sun || null}
                  t={t}
                  topView={topView}
                />
                {(evaluation.loading || sun.loading) && (
                  <div className="scene-update-note" role="status">
                    <LoaderCircle size={20} className="spin" />
                    {t(
                      "Updating in background · previous confirmed scene remains visible",
                      "背景更新中 · 仍顯示上次確認的畫面",
                    )}
                  </div>
                )}
              </div>
              <div className="placement-fields">
                <NumberField
                  label={t("Move array left / right", "整組面板左右移動")}
                  value={config.offset_x || 0}
                  min={-30}
                  max={30}
                  step={0.1}
                  unit="m"
                  onChange={(v) => setConfig((c) => ({ ...c, offset_x: v }))}
                />
                <NumberField
                  label={t("Move array forward / back", "整組面板前後移動")}
                  value={config.offset_y || 0}
                  min={-30}
                  max={30}
                  step={0.1}
                  unit="m"
                  onChange={(v) => setConfig((c) => ({ ...c, offset_y: v }))}
                />
                <button
                  onClick={() =>
                    setConfig((c) => ({ ...c, offset_x: 0, offset_y: 0 }))
                  }
                >
                  {t("Reset placement", "還原位置")}
                </button>
              </div>
              <div className="time-controls">
                <button type="button" onClick={() => setPlaying(!playing)}>
                  {playing ? t("Pause", "暫停") : t("Play day", "播放一天")}
                </button>
                <select
                  aria-label={t("Playback speed", "播放速度")}
                  value={playSpeed}
                  onChange={(e) => setPlaySpeed(+e.target.value)}
                >
                  <option value={0.25}>{t("Slow", "慢速")}</option>
                  <option value={1}>{t("Normal", "正常")}</option>
                  <option value={3}>{t("Fast", "快速")}</option>
                </select>
                <Sun size={18} />
                <select
                  aria-label={t("Preview month", "預覽月份")}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const value = `2025-${String(i + 1).padStart(2, "0")}-15`;
                    return (
                      <option key={value} value={value}>
                        {t(
                          new Date(2025, i, 15).toLocaleString("en", {
                            month: "long",
                          }),
                          `${i + 1} 月`,
                        )}
                      </option>
                    );
                  })}
                </select>
                <input
                  aria-label={t("Time of day", "一天中的時間")}
                  type="range"
                  min="0"
                  max="24"
                  step=".05"
                  value={previewHour}
                  onChange={(e) => {
                    setPlaying(false);
                    setPreviewHour(+e.target.value);
                  }}
                />
                <strong>
                  {String(Math.floor(previewHour)).padStart(2, "0")}:
                  {String(Math.round((previewHour % 1) * 60)).padStart(2, "0")}
                </strong>
              </div>
              <p className="microcopy">
                {t(
                  "Time playback only changes the view; it does not alter the confirmed plan or annual payback. The day’s path is computed once, then interpolated smoothly.",
                  "播放時間只改變觀察畫面，不修改已確認方案或全年回本結果。當天太陽軌跡先計算一次，再平滑播放。",
                )}
              </p>
              <p className="scene-caption">
                {t(
                  `Hong Kong time · 2025 mid-month sun preview · annual results use ${activeInputs.weather_year} weather (${activeInputs.weather_year === 2024 ? "8,784" : "8,760"} hours)`,
                  `香港時間 · 2025 年每月 15 日陽光示意 · 全年結果採 ${activeInputs.weather_year} 年氣象（${activeInputs.weather_year === 2024 ? "8,784" : "8,760"} 小時）`,
                )}
              </p>
              <div className="module-cap">
                <label className="select-field">
                  {t("Layout strategy", "排布方式")}
                  <select
                    aria-label={t("Layout strategy", "排布方式")}
                    value={config.layout_mode || defaultConfig.layout_mode}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, layout_mode: e.target.value }))
                    }
                  >
                    <option value="spread">
                      {t("Spread across roof", "在可用天台深度展開")}
                    </option>
                    <option value="compact">
                      {t(
                        "Compact within coverage limit",
                        "在覆蓋上限內緊湊排布",
                      )}
                    </option>
                  </select>
                </label>
                <NumberField
                  label={t(
                    "Minimum maintenance gap (assumed)",
                    "最小檢修間隙（假設）",
                  )}
                  value={inputs.minimum_access_gap_m}
                  min={0}
                  max={3}
                  step={0.05}
                  unit="m"
                  onChange={(v) => change("minimum_access_gap_m", v)}
                />
                <p className="microcopy">
                  {t(
                    "0.3 m is an editable screening assumption, not a certified access requirement. Row gaps are horizontal clear distances; coverage includes inter-row gaps.",
                    "0.3 m 是可調的篩選假設，並非經認證的通道要求。間隙指水平淨距；覆蓋面積包含排間空隙。",
                  )}
                  {ready && result.minimum_clear_gap_m != null
                    ? t(
                        ` Built minimum gap: ${result.minimum_clear_gap_m} m.`,
                        ` 實際最小間隙：${result.minimum_clear_gap_m} m。`,
                      )
                    : ""}
                </p>
              </div>
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
              <p className="scene-caption">
                {ready
                  ? t(
                      `Built ${result.actual_rows} of ${config.rows} requested rows.`,
                      `已建出 ${result.actual_rows} 排／要求 ${config.rows} 排。`,
                    )
                  : t("Checking actual row count…", "正在核對實際排數…")}
              </p>
              <div className="module-cap">
                <label className="goal-checkbox">
                  <input
                    type="checkbox"
                    checked={!(config.panel_limit > 0)}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        panel_limit: e.target.checked ? 0 : 22,
                      }))
                    }
                  />
                  {t("Fill all available module slots", "填滿所有可用板位")}
                </label>
                {config.panel_limit > 0 && (
                  <NumberField
                    label={t("Maximum modules", "面板數上限")}
                    value={config.panel_limit}
                    min={1}
                    max={2000}
                    onChange={(v) =>
                      setConfig((c) => ({ ...c, panel_limit: Math.round(v) }))
                    }
                  />
                )}
                <button
                  className="text-button"
                  onClick={() => setConfig((c) => ({ ...c, panel_limit: 22 }))}
                >
                  {t("Cap at 22 modules / 9.9 kW", "上限 22 塊／9.9 kW")}
                </button>
                <p className="microcopy">
                  {t(
                    "At 450 W/module, 22 modules are 9.9 kW; 23 are 10.35 kW. Above 10 kW, the HK$3/kWh rate applies to the whole system, not just the extra capacity. Actual fitting and selected constraints still apply.",
                    "每板 450 W：22 塊為 9.9 kW，23 塊為 10.35 kW。超過 10 kW 後，整個系統採 HK$3／度，並非只有新增容量降價。仍須符合實際板位及所選限制。",
                  )}
                </p>
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
                    `Based on ${activeInputs.weather_year} reference weather`,
                    `基於 ${activeInputs.weather_year} 年參考氣象資料`,
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
                <QuoteScreen
                  result={ready ? result : null}
                  inputs={activeInputs}
                  t={t}
                />
                <div className="card-title">
                  <Coins size={17} />
                  <h2>{t("Investment outlook", "投資結果")}</h2>
                </div>
                <div className="finance-line">
                  <span>{t("Initial investment", "一開始要付多少錢")}</span>
                  <strong>{ready ? money(result.initial_cost) : "—"}</strong>
                </div>
                <div className="finance-line">
                  <span>{t("FiT rate / kWh", "每賣一度電可收多少")}</span>
                  <strong>{ready ? `HK$ ${result.fit_rate}` : "—"}</strong>
                </div>
                <div className="payback">
                  <span>{t("First break-even", "首次回本")}</span>
                  <strong>
                    {ready
                      ? !result.panels_count
                        ? "—"
                        : payback
                          ? payback.slice(0, 7)
                          : t(
                              "Not reached in selected period",
                              "所選年限內未回本",
                            )
                      : "—"}
                  </strong>
                </div>
                <div className="finance-line">
                  <span>{t("Sustained break-even", "持續回本")}</span>
                  <strong>
                    {ready
                      ? !result.panels_count
                        ? "—"
                        : result[
                            activeInputs.post_fit
                              ? "stable_payback_B"
                              : "stable_payback_A"
                          ]?.slice(0, 7) ||
                          t(
                            "Not reached in selected period",
                            "所選年限內未達成",
                          )
                      : "—"}
                  </strong>
                </div>
                {advanced && (
                  <div className="finance-line">
                    <span>
                      {t(
                        "NPV at selected discount rate",
                        "考慮收錢早晚後，估計剩下多少",
                      )}
                    </span>
                    <strong>
                      {ready
                        ? money(
                            result[activeInputs.post_fit ? "npv_B" : "npv_A"],
                          )
                        : "—"}
                    </strong>
                  </div>
                )}
                <div className="finance-line">
                  <span>
                    {t("Balance by scheme end or selected end date", "計劃結束或所選年限前的結餘")}
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
                  <span>
                    {t(
                      `${activeInputs.analysis_years || 25}-year money left after costs`,
                      `${activeInputs.analysis_years || 25} 年收支相抵後剩下的錢`,
                    )}
                  </span>
                  <strong
                    className={
                      ready &&
                      (activeInputs.post_fit ? result.net_B : result.net_A) < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    {ready
                      ? money(
                          activeInputs.post_fit ? result.net_B : result.net_A,
                        )
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
            <Choices
              suggestions={suggestions}
              advanced={advanced}
              loading={simulation.loading}
              t={t}
              config={activeConfig}
              onChoose={(c) => {
                setConfig(c);
                document
                  .querySelector(".confirmation-bar")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            />
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
          <div className="charts-grid" hidden={!advanced}>
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
          <section className="card cashflow-card" hidden={!advanced}>
            <div className="card-title">
              <h2>
                {t("When does the investment come back?", "投資何時能回本？")}
              </h2>
              <div className="chart-legend">
                <span>
                  <i />
                  {t("No post-FiT income", "上網電價結束後無收入")}
                </span>
                {activeInputs.post_fit && (
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
                    domain={[cashTicks[0], cashTicks.at(-1)]}
                    ticks={cashTicks}
                    tickFormatter={(v) => `${v / 1000}k`}
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
                  {activeInputs.post_fit && (
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
                "HK$ · selected-period simple cash flow · replacement cost included at year 10 · break-even is the first nonnegative month, not a guarantee of staying positive.",
                "港元 · 所選年限收支累計 · 第 10 年計入更換費用 · 回本指首次非負月份，不代表其後一直為正。",
              )}
            </p>
          </section>
          <RadiationEvidence
            check={
              metadata.data?.irradiance_checks?.[activeInputs.weather_year]
            }
            t={t}
          />
          <MeasuredReference
            key={resetCount}
            inputs={activeInputs}
            config={activeConfig}
            t={t}
            onResult={setFieldReference}
          />
          <div hidden={!advanced}>
            <Suspense
              fallback={
                <p>{t("Loading sensitivity tools…", "正在載入敏感性工具…")}</p>
              }
            >
              <Evidence
                inputs={activeInputs}
                config={activeConfig}
                t={t}
                onEvidence={setEvidence}
              />
            </Suspense>
          </div>
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
                      {r.config.tilt}° · {r.config.azimuth}° ·{" "}
                      {r.actual_rows != null
                        ? `${r.actual_rows} ${t("rows", "排")}`
                        : t(
                            `${r.config.rows} requested rows (legacy result)`,
                            `要求 ${r.config.rows} 排（舊版結果）`,
                          )}{" "}
                      · {r.inputs.width} × {r.inputs.depth} m
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
                        ]?.slice(0, 7) ||
                          t(
                            "Not reached in selected period",
                            "所選年限內未達成",
                          )}
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
          {t(
            "Screening before contacting an installer.",
            "聯絡安裝商前的初步篩選工具。",
          )}
        </span>
        <p>
          {t(
            "Preliminary screening before contacting an installer. Simulated results are not engineering design or financial advice.",
            "聯絡安裝商前的初步篩選工具。結果屬模擬，並非工程設計或財務建議。",
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
