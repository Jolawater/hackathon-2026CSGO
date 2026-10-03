import React, { useEffect, useMemo, useRef, useState } from "react";
import regions from "../../data/regions.json";
import { NumberField } from "./Controls.jsx";
import { useApi } from "../lib/api.js";
import PaybackChart from "./PaybackChart.jsx";
import RoofScene from "./RoofScene3D.jsx";
import NeighbourBuildings from "./NeighbourBuildings.jsx";

export default function RegionalLab({ region, initial, t, onBack }) {
  const loc = regions[region],
    money = (n) =>
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: loc.currency,
        maximumFractionDigits: 0,
      }).format(n || 0);
  const defaults = {
    region,
    width: +initial.width,
    depth: +initial.depth,
    house_area: +initial.width * +initial.depth,
    village_house_mode: false,
    price_per_kw: +initial.price,
    fixed_cost: 0,
    annual_om: 0,
    inverter_cost: 0,
    commissioning: initial.date,
    monthly_demand_kwh: +initial.monthly_demand_kwh || 0,
    demand_coverage: 1,
    budget: +initial.budget || 0,
    max_payback_years: +initial.max_payback_years || 0,
    analysis_years: 25,
    require_profit: true,
    minimum_capacity_kw: 0,
    import_rate: 0,
    export_rate: 0,
    local_self_use_share: 0.5,
    usable_coverage_ratio: 0.5,
    weather_year: 2025,
    roof_rotation: 0,
    horizon: Array(12).fill(0),
    exclusions: [],
    neighbours: [],
    minimum_access_gap_m: 0.3,
    minimum_row_fill_ratio: 0,
    load_limit: 150,
    extra_mass_per_module: 0,
    discount_rate: 0.04,
  };
  const previous = useRef(null);
  if (initial.restore && !previous.current) {
    try {
      previous.current = JSON.parse(
        localStorage.getItem("roofsun-region-" + region),
      );
    } catch {}
  }
  const [inputs, setInputs] = useState(previous.current?.inputs || defaults),
    [config, setConfig] = useState(
      previous.current?.config || {
        rows: 2,
        tilt: 20,
        azimuth: 180,
        layout_mode: "compact",
      },
    );
  const fileRef = useRef(null);
  const [archiveError, setArchiveError] = useState("");
  const [confirmed, setConfirmed] = useState(previous.current),
    [day, setDay] = useState("2025-06-15"),
    [hour, setHour] = useState(12),
    [top, setTop] = useState(false);
  const [snapshot, setSnapshot] = useState(null),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setHour((h) => (h + 0.025 * speed) % 24), 50);
    return () => clearInterval(id);
  }, [playing, speed]);
  const pending =
    !confirmed ||
    JSON.stringify({ inputs, config }) !== JSON.stringify(confirmed);
  const preview = useApi("/api/evaluate", { inputs, config }, 250),
    answer = useApi("/api/simulate", confirmed?.inputs, 500, !!confirmed),
    track = useApi("/api/sun-track", { inputs, config, day }, 100);
  useEffect(() => {
    if (!preview.loading && !preview.error && preview.data)
      setSnapshot({ inputs, config, result: preview.data });
  }, [preview.data, preview.loading, preview.error, inputs, config]);
  const solar = useMemo(() => {
    const a = track.data?.samples;
    if (!a) return null;
    const i = Math.min(95, Math.floor(hour * 4)),
      f = (hour - i / 4) * 4;
    return {
      altitude: a[i].altitude + (a[i + 1].altitude - a[i].altitude) * f,
      azimuth:
        a[i].azimuth +
        (((a[i + 1].azimuth - a[i].azimuth + 540) % 360) - 180) * f,
    };
  }, [track.data, hour]);
  const selected =
    answer.data?.recommendations?.payback || answer.data?.recommendations?.npv;
  const change = (key, v) => setInputs((p) => ({ ...p, [key]: v }));
  const field = (key, label, min = 0, max = 100000, unit) => (
    <NumberField
      label={label}
      value={inputs[key]}
      min={min}
      max={max}
      step={0.01}
      unit={unit}
      onChange={(v) => change(key, v)}
    />
  );
  async function openArchive(file) {
    try {
      if (!file || file.size > 1000000)
        throw Error(
          t(
            "Choose a RoofSun backup under 1 MB",
            "請選擇 1 MB 以下的 RoofSun 備份",
          ),
        );
      const a = JSON.parse(await file.text());
      if (a.schema !== "roofsun-regional/v1" || a.inputs?.region !== region)
        throw Error(
          t(
            "This backup is for a different region or format",
            "此備份的地區或格式不符",
          ),
        );
      const check = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: a.inputs, config: a.config }),
      });
      if (!check.ok) throw Error(t("Invalid saved inputs", "備份內的參數無效"));
      setInputs(a.inputs);
      setConfig(a.config);
      setArchiveError("");
    } catch (e) {
      setArchiveError(e.message);
    }
  }
  function backup() {
    const a = {
      schema: "roofsun-regional/v1",
      model_version: "2.4.0",
      ...confirmed,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(a, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "roofsun-" + region + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function save() {
    const value = structuredClone({ inputs, config });
    setConfirmed(value);
    localStorage.setItem("roofsun-region-" + region, JSON.stringify(value));
  }
  function movePanel(index, dx, dy) {
    const panels = preview.data?.panels;
    if (!panels) return;
    const positions = panels.map((p) => ({
      x: p.corners.reduce((a, b) => a + b[0], 0) / 4,
      y: p.corners.reduce((a, b) => a + b[1], 0) / 4,
    }));
    positions[index].x += dx;
    positions[index].y += dy;
    setConfig((c) => ({
      ...c,
      manual_panels: positions,
      offset_x: 0,
      offset_y: 0,
    }));
  }
  return (
    <main className="workbench regional-lab">
      <button className="text-button" onClick={onBack}>
        {t("Back to setup", "返回填寫流程")}
      </button>
      <h1>{t(loc.en, loc.zh)} · RoofSun</h1>
      <p>
        {t(
          "Local reference weather, local currency, your own electricity contract.",
          "當地參考天氣、當地貨幣，以及你的用電合約。",
        )}
      </p>
      <section className="card everyday-inputs">
        <h2>{t("Budget, electricity and quote", "預算、用電及報價")}</h2>
        <div className="everyday-grid">
          {field(
            "budget",
            t("Installation budget", "安裝預算"),
            0,
            10000000,
            loc.currency,
          )}
          {field(
            "monthly_demand_kwh",
            t("Monthly electricity use", "每月用電量"),
            0,
            100000,
            "kWh",
          )}
          {field(
            "price_per_kw",
            t("Installation quote per kW", "每 kW 安裝報價"),
            1,
            100000,
            loc.currency,
          )}
          {field("width", t("Roof width", "天台寬度"), 2, 30, "m")}
          {field("depth", t("Roof length", "天台長度"), 2, 30, "m")}
          {field(
            "max_payback_years",
            t(
              "Desired payback years (0 = no cap)",
              "期望回本年限（0 表示不限）",
            ),
            0,
            25,
            t("years", "年"),
          )}
        </div>
        <h3>
          {t(
            "Enter prices from your bill or contract",
            "填寫電費單或合約上的價格",
          )}
        </h3>
        <div className="everyday-grid">
          {field(
            "import_rate",
            t("Price of grid electricity", "向電網購電價格"),
            0,
            10,
            loc.currency + "/kWh",
          )}
          {field(
            "export_rate",
            t("Price paid for exported electricity", "餘電售出價格"),
            0,
            10,
            loc.currency + "/kWh",
          )}
          {field(
            "local_self_use_share",
            t(
              "Assumed solar share used on site (0–1)",
              "假設發電自用比例（0–1）",
            ),
            0,
            1,
          )}
        </div>
        <p>
          {t(
            "Zero prices produce no income. Self-used energy saves purchases; only the remainder is sold. The share is an assumption, not a time-matched household load simulation. Taxes, subsidies and future contract changes are omitted.",
            "電價為 0 時不產生相應收益。自用部分抵消購電，剩餘部分才售出，不重複算收入。自用比例屬假設，尚未模擬家庭逐時負載；未計稅項、補貼和未來合約變動。",
          )}
        </p>
        <a
          href={
            region === "london"
              ? "https://www.ofgem.gov.uk/environmental-and-social-schemes/smart-export-guarantee-seg"
              : "https://fgw.sz.gov.cn/gkmlpt/content/10/10353/mpost_10353813.html"
          }
          target="_blank"
          rel="noreferrer"
        >
          {t(
            "Official policy context — use your actual contract for prices",
            "官方制度背景 · 價格請以你的實際合約為準",
          )}
        </a>
      </section>
      <details className="professional-parameters card">
        <summary>
          {t("More professional parameter adjustments", "更專業的參數調整")}
        </summary>
        <div className="everyday-grid">
          {field(
            "house_area",
            t("Building covered area", "屋宇有蓋面積"),
            inputs.width * inputs.depth,
            1500,
            "m²",
          )}
          {field(
            "usable_coverage_ratio",
            t(
              "Assumed allowed cover share (not local approval)",
              "假設可覆蓋比例（非當地批准）",
            ),
            0.01,
            1,
          )}
          {field(
            "fixed_cost",
            t("Additional installation costs", "額外安裝費"),
            0,
            1000000,
            loc.currency,
          )}
          {field(
            "annual_om",
            t("Annual maintenance", "每年維護費"),
            0,
            100000,
            loc.currency,
          )}
          {field(
            "inverter_cost",
            t("Year-10 replacement cost", "第十年更換費"),
            0,
            100000,
            loc.currency,
          )}
          {field("analysis_years", t("Analysis years", "比較年限"), 1, 25)}
          {field("roof_rotation", t("Roof direction", "天台方向"), 0, 359, "°")}
          {field(
            "minimum_access_gap_m",
            t("Access gap assumption", "檢修空間假設"),
            0,
            3,
            "m",
          )}
          {field("discount_rate", t("Discount rate", "折現率"), 0, 0.3)}
        </div>
        <NeighbourBuildings inputs={inputs} change={change} t={t} />
        <p>
          {t(
            "Roof coverage and load limits are editable screening assumptions, not Hong Kong rules applied abroad or local engineering approval. All panels retain a shared tilt and bearing.",
            "覆蓋與荷載限制是可調的篩選假設，沒有把香港規則當作外地法規，也不是當地工程批准。所有面板仍共用傾角和朝向。",
          )}
        </p>
      </details>
      {inputs.house_area < inputs.width * inputs.depth && (
        <p role="alert">
          {t(
            "The roof now exceeds the recorded building area. Update Building covered area in professional parameters to continue.",
            "天台尺寸已超過已記錄的屋宇面積。請展開專業參數，核對並更新屋宇有蓋面積。",
          )}
        </p>
      )}
      <section className="card regional-scene">
        <button onClick={() => setTop(!top)}>
          {top ? t("Perspective", "立體") : t("Top view", "俯視")}
        </button>
        <RoofScene
          inputs={snapshot?.inputs || inputs}
          config={snapshot?.config || config}
          result={snapshot?.result || null}
          sun={solar}
          t={t}
          topView={top}
          onPlace={(x, y) =>
            setConfig((c) => ({ ...c, offset_x: x, offset_y: y }))
          }
          onMovePanel={movePanel}
          onRotate={(azimuth) => setConfig((c) => ({ ...c, azimuth }))}
        />
        <div className="time-controls">
          <button onClick={() => setPlaying(!playing)}>
            {playing ? t("Pause", "暫停") : t("Play day", "播放一天")}
          </button>
          <select
            aria-label={t("Playback speed", "播放速度")}
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          >
            {[0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
          <label>
            {t("Month", "月份")}
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => (
                <option
                  key={i}
                  value={`2025-${String(i + 1).padStart(2, "0")}-15`}
                >
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label={t("Time of day", "一天中的時間")}
            type="range"
            min="0"
            max="24"
            step=".05"
            value={hour}
            onChange={(e) => setHour(+e.target.value)}
          />
          <span>
            {Math.floor(hour)}:
            {String(Math.floor((hour % 1) * 60)).padStart(2, "0")}
          </span>
        </div>
        <p>
          {loc.timezone} ·{" "}
          {t(
            "Geometry preview, not future weather",
            "幾何預覽，不是未來天氣預報",
          )}
        </p>
        <div className="everyday-grid">
          <NumberField
            label={t("Panel rows", "面板排數")}
            value={config.rows}
            min={1}
            max={12}
            onChange={(rows) =>
              setConfig((c) => ({ ...c, rows, manual_panels: null }))
            }
          />
          <NumberField
            label={t("Panel tilt", "面板傾角")}
            value={config.tilt}
            min={0}
            max={40}
            onChange={(tilt) => setConfig((c) => ({ ...c, tilt }))}
          />
          <NumberField
            label={t("Panel bearing", "面板朝向")}
            value={config.azimuth}
            min={0}
            max={359}
            onChange={(azimuth) => setConfig((c) => ({ ...c, azimuth }))}
          />
        </div>
        <button
          onClick={() =>
            setConfig((c) => ({
              ...c,
              manual_panels: null,
              offset_x: 0,
              offset_y: 0,
            }))
          }
        >
          {t("Reset placement", "還原位置")}
        </button>
        {preview.loading && <p>{t("Updating preview…", "正在更新預覽…")}</p>}
        {preview.error && <p role="alert">{preview.error}</p>}
        {preview.data?.violations?.length > 0 && (
          <p role="alert">
            {t(
              "This layout fails the selected space/load assumptions. Try fewer panels or reset placement.",
              "此排布未通過所選空間／荷載假設，請減少面板或還原位置。",
            )}
          </p>
        )}
      </section>
      <section className="plan-brief card">
        <h2>
          {t(
            "Recommendation for your confirmed conditions",
            "按已確認條件給你的建議",
          )}
        </h2>
        {!confirmed ? (
          <p>
            {t(
              "Check the assumptions and confirm to compare options.",
              "核對假設並確認後，再比較推薦方案。",
            )}
          </p>
        ) : answer.loading ? (
          <p>{t("Comparing…", "正在比較…")}</p>
        ) : selected ? (
          <>
            <h3>
              {selected.panels_count} {t("panels", "塊面板")} ·{" "}
              {money(selected.initial_cost)}
            </h3>
            <p>
              {Math.round(selected.annual_kwh)} kWh/{t("year", "年")} ·{" "}
              {t("Sustained payback", "所選年限內持續回本")}{" "}
              {selected.stable_payback_A?.slice(0, 7) ||
                t("not reached", "未達成")}
            </p>
            <p>
              {t(
                "Chosen for faster payback among searched plans meeting the budget and annual energy target. More generation can cost more; no global optimum is claimed.",
                "在符合預算及年度發電目標的搜尋方案中，優先選較快回本的方案。多發電可能要多花錢；不聲稱全局最優。",
              )}
            </p>
            <button onClick={() => setConfig(selected.config)}>
              {t("Preview this recommendation", "預覽這個建議")}
            </button>
          </>
        ) : (
          <p>
            {t(
              "No searched plan meets all goals. Check prices, budget and energy demand before relaxing the payback target.",
              "未找到同時符合要求的方案。請先核對電價、預算和發電需求，再考慮放寬回本期限。",
            )}
          </p>
        )}
      </section>
      {confirmed && (
        <PaybackChart
          inputs={confirmed.inputs}
          config={confirmed.config}
          suggestions={answer.loading ? null : answer.data?.recommendations}
          pending={pending}
          t={t}
          currency={loc.currency}
        />
      )}
      <details className="plan-management card">
        <summary>{t("Plan management", "方案管理")}</summary>
        <button onClick={() => fileRef.current.click()}>
          {t("Open saved plan", "打開已保存方案")}
        </button>
        <button onClick={backup} disabled={!confirmed}>
          {t("Download plan backup", "下載方案備份")}
        </button>
        <input
          hidden
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={(e) => {
            openArchive(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <p>
          {t(
            "Opened plans are drafts until confirmed. Downloads contain your last confirmed settings.",
            "打開的方案先作預覽，確認後才保留。下載內容是上次確認的設定。",
          )}
        </p>
        {archiveError && <p role="alert">{archiveError}</p>}
      </details>
      <p className="microcopy">
        {t(
          "NASA POWER 2023–2025 city grid data; not roof measurements. Three years and source records are bundled. Nearby cities may share weather grid cells.",
          "NASA POWER 2023–2025 城市網格資料，不是天台實測；三年資料及來源記錄已隨專案保存。鄰近城市可能共用氣象網格。",
        )}
      </p>
      <a
        href="https://power.larc.nasa.gov/docs/services/api/temporal/"
        target="_blank"
        rel="noreferrer"
      >
        NASA POWER
      </a>
      {pending && (
        <div className="confirmation-actions">
          <button
            onClick={() => {
              if (confirmed) {
                setInputs(structuredClone(confirmed.inputs));
                setConfig(structuredClone(confirmed.config));
              } else onBack();
            }}
          >
            {t("Cancel changes", "取消修改")}
          </button>
          <button
            className="confirm-primary"
            onClick={save}
            disabled={
              !!preview.error || inputs.house_area < inputs.width * inputs.depth
            }
          >
            {t("Confirm and keep", "確認並保留")}
          </button>
        </div>
      )}
    </main>
  );
}
