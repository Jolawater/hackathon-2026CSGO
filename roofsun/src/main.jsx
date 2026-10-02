import React, { useEffect, useMemo, useRef, useState } from "react";
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
const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString("en-HK", { maximumFractionDigits: d });
const money = (n) => `HK$ ${fmt(n)}`;
const errorNames = {
  no_space: ["Not enough room for a module", "空間不足以放置面板"],
  overlap: ["Rows overlap or exceed the roof", "排數過多，面板重疊或超出天台"],
  coverage: [
    "Continuous-cover area exceeds the selected limit",
    "連續覆蓋面積超過所選限制",
  ],
  load: [
    "Estimated module and rack load exceeds the limit",
    "估算面板與支架荷載超過限制",
  ],
};

function useApi(path, body, delay = 200) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const serialized = JSON.stringify(body);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(path, {
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(
            Array.isArray(result.detail)
              ? result.detail.map((x) => x.msg).join("; ")
              : result.detail || "Calculation failed",
          );
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      } catch (e) {
        if (e.name !== "AbortError" && !controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, serialized, delay]);
  return { data, loading, error };
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  unit,
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            if (e.target.value !== "") {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}
function Slider({ label, value, min, max, step = 1, onChange, unit = "", id }) {
  return (
    <label className="slider-field" htmlFor={id}>
      <span>
        {label}
        <strong>
          {fmt(value, 1)}
          {unit}
        </strong>
      </span>
      <input
        id={id}
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="range-ends">
        <small>
          {min}
          {unit}
        </small>
        <small>
          {max}
          {unit}
        </small>
      </span>
    </label>
  );
}
function Pill({ children, kind = "" }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}

function RoofScene({ inputs, config, result, sun, t, topView }) {
  const w = inputs.width,
    d = inputs.depth,
    scale = Math.min(43, 300 / Math.max(w, d));
  const project = (x, y, z = 0) =>
    topView
      ? [300 + (x - w / 2) * scale, 235 - (y - d / 2) * scale]
      : [
          300 + (x - w / 2) * scale + (y - d / 2) * scale * 0.58,
          265 +
            (x - w / 2) * scale * 0.31 -
            (y - d / 2) * scale * 0.52 -
            z * scale * 1.35,
        ];
  const points = (arr) => arr.map((p) => project(...p).join(",")).join(" ");
  const roof = [
    [0, 0, 0],
    [w, 0, 0],
    [w, d, 0],
    [0, d, 0],
  ];
  const height = 1.762 * Math.sin((config.tilt * Math.PI) / 180);
  const north = (inputs.roof_rotation * Math.PI) / 180;
  const origin = project(w / 2, d / 2),
    northPoint = project(w / 2 - Math.sin(north), d / 2 + Math.cos(north));
  const compassRotation =
    (Math.atan2(northPoint[0] - origin[0], origin[1] - northPoint[1]) * 180) /
    Math.PI;
  const altitude = sun?.altitude ?? 0,
    sunAngle = (((sun?.azimuth ?? 180) - inputs.roof_rotation) * Math.PI) / 180;
  const dx =
      -Math.sin(sunAngle) /
      Math.max(Math.tan((altitude * Math.PI) / 180), 0.05),
    dy =
      -Math.cos(sunAngle) /
      Math.max(Math.tan((altitude * Math.PI) / 180), 0.05);
  const panels = [...(result?.panels || [])].sort((a, b) => {
    const ac = a.corners.reduce((v, p) => v + project(...p)[1], 0),
      bc = b.corners.reduce((v, p) => v + project(...p)[1], 0);
    return ac - bc;
  });
  return (
    <svg
      className="roof-scene"
      viewBox="0 0 600 440"
      role="img"
      aria-label={t(
        "Solar module layout and shadows based on the selected time",
        "按所選時間顯示面板排布及陰影",
      )}
    >
      <defs>
        <pattern
          id="floor-grid"
          width="30"
          height="30"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 30 0 L 0 0 0 30"
            fill="none"
            stroke="#dce3d7"
            strokeWidth=".6"
          />
        </pattern>
        <linearGradient id="panel" x1="0" x2="1" y2="1">
          <stop stopColor="#285963" />
          <stop offset="1" stopColor="#113b45" />
        </linearGradient>
        <clipPath id="roof-clip">
          <polygon points={points(roof)} />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="600" height="440" fill="url(#floor-grid)" />
      <ellipse
        cx="304"
        cy="306"
        rx="203"
        ry="55"
        fill="#152e1e"
        opacity=".07"
      />
      {!topView && (
        <>
          <polygon
            points={points([
              [0, 0, -0.65],
              [w, 0, -0.65],
              [w, 0, 0],
              [0, 0, 0],
            ])}
            fill="#c4cdbd"
          />
          <polygon
            points={points([
              [w, 0, -0.65],
              [w, d, -0.65],
              [w, d, 0],
              [w, 0, 0],
            ])}
            fill="#aebca8"
          />
        </>
      )}
      <polygon
        points={points(roof)}
        fill="#f7f8ee"
        stroke="#859b7c"
        strokeWidth="1.6"
      />
      <g clipPath="url(#roof-clip)">
        {Array.from({ length: Math.ceil(w) }, (_, i) => (
          <path
            key={"x" + i}
            d={`M${project(i, 0).join(",")}L${project(i, d).join(",")}`}
            stroke="#dfe5d6"
            strokeWidth=".7"
          />
        ))}
        {Array.from({ length: Math.ceil(d) }, (_, i) => (
          <path
            key={"y" + i}
            d={`M${project(0, i).join(",")}L${project(w, i).join(",")}`}
            stroke="#dfe5d6"
            strokeWidth=".7"
          />
        ))}
        {altitude > 0 &&
          sun?.beam_clear &&
          panels.map((p, i) => (
            <polygon
              key={"shadow" + i}
              points={points(
                p.corners.map(([x, y], j) => [
                  x + (j >= 2 ? height : 0) * dx,
                  y + (j >= 2 ? height : 0) * dy,
                  0,
                ]),
              )}
              fill="#243e2a"
              opacity=".23"
            />
          ))}
      </g>
      <polygon
        points={points([
          [0.5, 0.5],
          [w - 0.5, 0.5],
          [w - 0.5, d - 0.5],
          [0.5, d - 0.5],
        ])}
        fill="none"
        stroke="#a5b798"
        strokeDasharray="4 5"
        strokeWidth="1"
      />
      {panels.map((p, i) => {
        const pts = p.corners.map(([x, y], j) => [x, y, j >= 2 ? height : 0]);
        const shade = sun?.beam_clear ? sun.row_shade[p.row] || 0 : 1;
        const mix = (a, b, k) => a.map((v, j) => v + (b[j] - v) * k);
        return (
          <g key={i}>
            <polygon
              points={points(pts)}
              fill="url(#panel)"
              stroke="#b7d4ce"
              strokeWidth="1"
            />
            {[0.25, 0.5, 0.75].map((n) => (
              <path
                key={n}
                d={`M${project(...mix(pts[0], pts[1], n)).join(",")}L${project(...mix(pts[3], pts[2], n)).join(",")}`}
                stroke="#8eb5bb"
                strokeWidth=".5"
                opacity=".6"
              />
            ))}
            {[0.33, 0.66].map((n) => (
              <path
                key={n}
                d={`M${project(...mix(pts[0], pts[3], n)).join(",")}L${project(...mix(pts[1], pts[2], n)).join(",")}`}
                stroke="#8eb5bb"
                strokeWidth=".5"
                opacity=".6"
              />
            ))}
            {shade > 0 && (
              <polygon
                points={points([
                  pts[0],
                  pts[1],
                  mix(pts[1], pts[2], shade),
                  mix(pts[0], pts[3], shade),
                ])}
                fill="#071921"
                opacity=".68"
              />
            )}
          </g>
        );
      })}
      <path
        d={`M${project(0, -0.6).join(",")}L${project(w, -0.6).join(",")}`}
        stroke="#80947a"
        strokeWidth="1"
      />
      <text
        x={project(w / 2, -1)[0]}
        y={project(w / 2, -1)[1] + 12}
        textAnchor="middle"
        fill="#586b52"
        fontSize="12"
      >
        {fmt(w, 1)} m
      </text>
      <text
        x={project(-1, d / 2)[0] - 15}
        y={project(-1, d / 2)[1]}
        fill="#586b52"
        fontSize="12"
      >
        {fmt(d, 1)} m
      </text>
      <g transform="translate(530,344)">
        <circle r="25" fill="#f7f8ee" stroke="#d0d8c7" />
        <g transform={`rotate(${compassRotation})`}>
          <path d="M0-17 6 7 0 3 -6 7Z" fill="#244d39" />
        </g>
        <text y="-33" textAnchor="middle" fontSize="11" fill="#496044">
          N
        </text>
      </g>
      <g transform="translate(25,378)">
        <rect width="165" height="52" rx="8" fill="#fbfcf6" stroke="#d9e1d1" />
        <circle cx="17" cy="17" r="4" fill="#376a6a" />
        <text x="29" y="21" fontSize="11" fill="#455844">
          {t("Solar modules", "太陽能面板")}
        </text>
        <circle cx="17" cy="36" r="4" fill="#1e2c30" />
        <text x="29" y="40" fontSize="11" fill="#455844">
          {t("Geometric shadow", "幾何陰影")}
        </text>
      </g>
      {!panels.length && (
        <text x="300" y="215" textAnchor="middle" fill="#7c4b2c" fontSize="16">
          {t("No modules fit this configuration", "此配置無法放置面板")}
        </text>
      )}
    </svg>
  );
}

function Horizon({ values, onChange, t }) {
  const [expanded, setExpanded] = useState(false),
    [direction, setDirection] = useState(180),
    [angle, setAngle] = useState(30);
  return (
    <div className="horizon-control">
      <div className="section-label">
        {t("SURROUNDING SHADE", "周圍遮擋")}
        <button
          className="text-button"
          onClick={() => onChange(Array(12).fill(0))}
        >
          {t("Clear", "清除")}
        </button>
      </div>
      <svg
        viewBox="0 0 270 65"
        className="skyline"
        role="img"
        aria-label={t("Horizon angles", "天際線仰角")}
      >
        <line x1="0" y1="49" x2="270" y2="49" stroke="#c5d1c2" />
        <path
          d={
            "M0,49 " +
            values
              .concat(values[0])
              .map((v, i) => `L${i * 22.5},${49 - v * 0.5}`)
              .join(" ") +
            " L270,49Z"
          }
          fill="#cbd8c2"
          stroke="#709066"
        />
        {["N", "E", "S", "W", "N"].map((v, i) => (
          <text
            key={i}
            x={i * 67.5}
            y="63"
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            fontSize="9"
            fill="#74806d"
          >
            {v}
          </text>
        ))}
      </svg>
      <div className="shade-add">
        <select
          aria-label={t("Obstacle direction", "遮擋方向")}
          value={direction}
          onChange={(e) => setDirection(+e.target.value)}
        >
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((v) => (
            <option key={v} value={v}>
              {v}°{" "}
              {v === 180
                ? t("South", "南")
                : v === 90
                  ? t("East", "東")
                  : v === 270
                    ? t("West", "西")
                    : v === 0
                      ? t("North", "北")
                      : ""}
            </option>
          ))}
        </select>
        <input
          aria-label={t("Obstacle elevation", "遮擋仰角")}
          type="number"
          min="0"
          max="80"
          value={angle}
          onChange={(e) => setAngle(Math.min(80, Math.max(0, +e.target.value)))}
        />
        <button
          onClick={() => {
            const next = [...values];
            next[direction / 30] = angle;
            onChange(next);
          }}
        >
          {t("Set", "設定")}
        </button>
      </div>
      <button
        className="text-button advanced-button"
        onClick={() => setExpanded(!expanded)}
      >
        {t("12-direction measurements", "十二方位量度")}
        <ChevronDown size={13} />
      </button>
      {expanded && (
        <div className="horizon-grid">
          {values.map((v, i) => (
            <NumberField
              key={i}
              label={`${i * 30}°`}
              value={v}
              max={80}
              onChange={(n) =>
                onChange(values.map((old, j) => (j === i ? n : old)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Validation({ t }) {
  const { data: meta, error } = useApi("/api/meta", undefined, 0),
    { data: validation } = useApi("/api/validation", undefined, 0);
  return (
    <main className="validation-view">
      <div className="page-intro">
        <span className="eyebrow">{t("UNDER THE MODEL", "模型依據")}</span>
        <h1>{t("Know what goes into your result.", "了解結果的依據。")}</h1>
        <p>
          {t(
            "Reference data, reproducible checks and the assumptions behind every configuration.",
            "參考數據、可重現的檢查，以及每個配置背後的假設。",
          )}
        </p>
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="validation-grid">
        <section className="card">
          <div className="card-title">
            <ShieldCheck size={20} />
            <h2>{t("Model checks", "模型檢查")}</h2>
          </div>
          <p className="muted">
            {t(
              "These are software and relationship checks, not field validation of annual yield.",
              "以下是軟件及物理關係檢查，不代表全年發電量已經實地驗證。",
            )}
          </p>
          {validation ? (
            validation.checks.map((c, i) => (
              <div className="check-row" key={i}>
                <Check size={16} />
                <div>
                  <strong>{t(c.name_en, c.name_zh)}</strong>
                  <p>{t(c.description_en, c.description_zh)}</p>
                  <code>{c.observed}</code>
                  {c.source_url && (
                    <a
                      className="check-source"
                      href={c.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Reference source", "參考來源")}{" "}
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p>{t("Loading validation report…", "正在載入檢查報告…")}</p>
          )}
        </section>
        <section className="card">
          <div className="card-title">
            <Layers size={20} />
            <h2>{t("Data & assumptions", "數據與假設")}</h2>
          </div>
          <dl className="source-list">
            <dt>{t("Weather", "氣象")}</dt>
            <dd>
              NASA POWER · 2025 · 8,760 {t("hourly samples", "逐小時資料")}
              <p>
                {t(
                  "One gridded reference location at 22.45° N, 114.16° E. Used for all rooftops; not an address-specific measurement. UTC data converted to Hong Kong time.",
                  "所有天台採用北緯 22.45°、東經 114.16° 的網格參考資料，並非個別地址實測。UTC 資料轉為香港時間。",
                )}
              </p>
              <a
                href="https://power.larc.nasa.gov/docs/services/api/temporal/hourly/"
                target="_blank"
                rel="noreferrer"
              >
                NASA POWER <ExternalLink size={12} />
              </a>
            </dd>
            <dt>{t("Reference module", "參考面板")}</dt>
            <dd>
              450 W · 1.762 × 1.134 m · 22 kg
              <p>
                {t(
                  "Generic engineering assumptions; not a selected commercial product. Rack weight: 8 kg/module; system factor: 0.85; annual degradation: 0.5%.",
                  "一般工程假設，並非指定商品。支架每板 8 kg、系統係數 0.85、年衰減 0.5%。",
                )}
              </p>
            </dd>
            <dt>{t("Policy reference", "政策依據")}</dt>
            <dd>
              {t(
                "EMSD FiT FAQ · checked 2 Oct 2026",
                "機電署上網電價常見問題 · 2026 年 10 月 2 日核對",
              )}
              <p>
                {t(
                  "Continuous-cover village-house case only. Module + rack load check excludes ballast and wind load; it does not establish structural safety.",
                  "只考慮村屋連續覆蓋安裝情形。面板及支架荷載未含壓重與風荷載，不能據此判定結構安全。",
                )}
              </p>
              <a
                href={
                  meta?.settings.policy.source_url ||
                  "https://re.emsd.gov.hk/tc_chi/fit/int/fit_int.html"
                }
                target="_blank"
                rel="noreferrer"
              >
                {t("Official source", "官方來源")} <ExternalLink size={12} />
              </a>
            </dd>
            <dt>{t("Financial assumptions", "財務假設")}</dt>
            <dd>
              {t(
                "Editable quote and costs. 25-year life; one inverter replacement at year 10. Simple cash flow, without discounting or inflation.",
                "報價與費用可修改。壽命 25 年，第 10 年更換一次逆變器。採用簡單現金流，未計折現及通脹。",
              )}
            </dd>
          </dl>
        </section>
      </div>
      <section className="card limitations">
        <h2>{t("What the model leaves out", "模型未涵蓋的因素")}</h2>
        <p>
          {t(
            "Linear geometric shading does not model bypass-diode electrical losses, finite row-end shadows or nearby rooftop objects. Sky-view correction uses a horizontal approximation. No glass incidence-angle loss, detailed inverter clipping, structural design or address-specific weather. Future self-consumption depends on actual load and electrical arrangements; it is a scenario, not a guaranteed income.",
            "採用線性幾何遮擋，未模擬旁路二極管電損、有限排長的陰影或天台近距離物件。天空可視因子使用水平面近似。未計玻璃入射角損失、詳細逆變器削峰、結構設計與地址專屬氣象。未來自用取決於實際用電及電力安排，只是情景假設，並非保證收入。",
          )}
        </p>
      </section>
    </main>
  );
}

function App() {
  const [lang, setLang] = useState(
    () => localStorage.getItem("roofsun-language") || "en",
  );
  const zh = lang === "zh";
  const t = (en, cn) => (zh ? cn : en);
  const [inputs, setInputs] = useState({ ...defaults }),
    [config, setConfig] = useState(defaultConfig),
    [preset, setPreset] = useState("open"),
    [tab, setTab] = useState("design");
  const [day, setDay] = useState("2025-12-21"),
    [hour, setHour] = useState(12),
    [topView, setTopView] = useState(false),
    [saved, setSaved] = useState([]);
  const [retry, setRetry] = useState(0);
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
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "width" || key === "depth")
        next.house_area = Math.max(next.house_area, next.width * next.depth);
      return next;
    });
  };
  useEffect(() => {
    localStorage.setItem("roofsun-language", lang);
    document.documentElement.lang = zh ? "zh-Hant" : "en";
  }, [lang]);
  const payback = result?.[inputs.post_fit ? "payback_B" : "payback_A"];
  function save() {
    if (!ready) return;
    setSaved((old) => [
      ...old.slice(-1),
      {
        ...result,
        inputs: structuredClone(inputs),
        saved_at: new Date().toISOString(),
      },
    ]);
  }
  function exportSaved() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: "roofsun-hk/v1",
            simulated: true,
            reference_weather: 2025,
            plans: saved,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roofsun-plans.json";
    a.click();
    URL.revokeObjectURL(url);
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
            {t("Reference year 2025", "參考年份 2025")}
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
        <Validation t={t} />
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
                  min={inputs.width * inputs.depth}
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
                  "Hong Kong time · geometric shadow preview · annual results use all 8,760 weather hours",
                  "香港時間 · 幾何陰影預覽 · 全年結果使用全部 8,760 小時氣象資料",
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
                  max={6}
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
                    "Based on 2025 reference weather",
                    "基於 2025 年參考氣象資料",
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
                      <strong>{fmt(result.load_kg_m2, 1)} / 150 kg/m²</strong>
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
                    "Includes spacing, coverage and assumed module/rack weight. Ballast, wind load and structural safety are not assessed.",
                    "包含間距、覆蓋及假設面板／支架重量。未評估壓重、風荷載及結構安全。",
                  )}
                </p>
              </section>
            </aside>
          </div>
          {(evaluation.error || simulation.error || sun.error) && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={17} />
              <span>
                {t(
                  "Could not calculate. Check inputs or ensure the local API is running.",
                  "無法計算，請檢查輸入或確認本機 API 正在運行。",
                )}{" "}
                {evaluation.error || simulation.error || sun.error}
              </span>
              <button onClick={() => setRetry((r) => r + 1)}>
                {t("Retry", "重試")}
              </button>
            </div>
          )}
          <section className="recommendation-section">
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
                    {t("Exploring 210 configurations…", "正在探索 210 個配置…")}
                  </>
                ) : (
                  `${simulation.data?.configs.length || 0} ${t("feasible configurations", "個可行配置")}`
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
                  </button>
                );
              })}
            </div>
            <p className="microcopy recommendation-note">
              {t(
                "Choices come from the non-dominated cost–generation frontier. Balanced = closest to the ideal after normalizing cost and energy; not a financial guarantee.",
                "推薦來自成本與發電量的取捨前沿。折中方案為成本及發電量標準化後最接近理想點的配置，並非財務保證。",
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
          <section className="card saved-card">
            <div className="card-title">
              <h2>{t("Your side-by-side comparison", "並排比較你的方案")}</h2>
              <button
                className="text-button"
                onClick={exportSaved}
                disabled={!saved.length}
              >
                <Download size={14} />
                {t("Export JSON", "匯出 JSON")}
              </button>
            </div>
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
                  <div key={r.saved_at} className="saved-plan">
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
