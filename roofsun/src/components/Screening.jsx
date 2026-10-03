import React, { useState } from "react";
import { NumberField } from "./Controls.jsx";
import { fmt, money } from "../lib/format.js";

export function NeighbourInput({ horizon, onChange, t }) {
  const [floors, setFloors] = useState(0),
    [distance, setDistance] = useState(10),
    [direction, setDirection] = useState(180),
    [sector, setSector] = useState(60);
  const angle = Math.min(
    80,
    (Math.atan2(floors * 3, distance) * 180) / Math.PI,
  );
  function apply() {
    const values = Array.from({ length: 12 }, (_, i) => {
      const delta = Math.abs(((i * 30 - direction + 540) % 360) - 180);
      // Sample a constant-height facade at each azimuth; slant distance grows off-axis.
      return delta <= sector / 2
        ? Math.min(
            80,
            (Math.atan2(
              floors * 3 * Math.cos((delta * Math.PI) / 180),
              distance,
            ) *
              180) /
              Math.PI,
          )
        : 0;
    });
    onChange(values.map((v) => Math.round(v * 10) / 10));
  }
  return (
    <div className="neighbour-input">
      <strong>{t("Neighbour shading", "鄰屋遮擋")}</strong>
      <div className="field-pair">
        <NumberField
          label={t("Floors above your rooftop", "鄰屋高於天台的層數")}
          value={floors}
          min={0}
          max={15}
          step={0.5}
          onChange={setFloors}
        />
        <NumberField
          label={t("Distance to neighbour", "與鄰屋距離")}
          value={distance}
          min={0.5}
          max={200}
          unit="m"
          onChange={setDistance}
        />
      </div>
      <label className="select-field">
        {t("Neighbour direction", "鄰屋方位")}
        <select
          aria-label={t("Neighbour direction", "鄰屋方位")}
          value={direction}
          onChange={(e) => setDirection(+e.target.value)}
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((v, i) => (
            <option key={v} value={v}>
              {t(
                [
                  "North",
                  "North-east",
                  "East",
                  "South-east",
                  "South",
                  "South-west",
                  "West",
                  "North-west",
                ][i],
                ["北", "東北", "東", "東南", "南", "西南", "西", "西北"][i],
              )}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label={t("Neighbour angular width", "鄰屋視角寬度")}
        value={sector}
        min={30}
        max={180}
        step={15}
        unit="°"
        onChange={setSector}
      />
      <p className="microcopy">
        {t(
          `Assumes 3 m per extra floor above the module plane. Centre elevation ${fmt(angle, 1)}°. Current maximum horizon ${fmt(Math.max(...horizon), 1)}°. Applying replaces the 12-direction horizon; detailed measurements remain available in Advanced mode.`,
          `假設高於面板平面的每層為 3 m。中心仰角 ${fmt(angle, 1)}°，目前最大仰角 ${fmt(Math.max(...horizon), 1)}°。套用後會取代 12 方位天際線；進階模式可輸入實測值。`,
        )}
      </p>
      <button className="text-button" onClick={apply}>
        {t("Apply neighbour shading", "套用鄰屋遮擋")}
      </button>
    </div>
  );
}

export function MountingInput({ inputs, change, t }) {
  return (
    <div className="mounting-input">
      <label className="select-field">
        {t("Mounting weight preset", "支架重量預設")}
        <select
          aria-label={t("Mounting weight preset", "支架重量預設")}
          value={
            inputs.extra_mass_per_module === 0
              ? "anchor"
              : inputs.extra_mass_per_module === 40
                ? "ballast"
                : "custom"
          }
          onChange={(e) =>
            change(
              "extra_mass_per_module",
              e.target.value === "ballast" ? 40 : 0,
            )
          }
        >
          <option value="anchor">
            {t(
              "Anchored · no added ballast assumed",
              "錨固式 · 假設無額外壓重",
            )}
          </option>
          <option value="ballast">
            {t(
              "Ballasted · assumed +40 kg/module",
              "壓重式 · 假設每板加 40 kg",
            )}
          </option>
          <option value="custom" disabled>
            {t("Custom added mass", "自訂額外重量")}
          </option>
        </select>
      </label>
      <p className="microcopy">
        {t(
          "Both include 22 kg/module + 8 kg/rack. The 40 kg ballast is a screening assumption, not a typhoon fixing design. Wind uplift and point loads need a structural engineer.",
          "兩者均計入面板 22 kg 及支架 8 kg。40 kg 壓重只是篩選假設，並非抗颱風固定設計；風吸力及支承集中荷載須由結構工程師評估。",
        )}
      </p>
    </div>
  );
}

export function QuoteScreen({ result, inputs, t }) {
  const key = inputs.post_fit ? "B" : "A";
  const ceiling = result?.[`max_acceptable_quote_${key}`],
    stress = result?.[`max_acceptable_quote_stress_${key}`];
  return (
    <section className="quote-screen">
      <span className="eyebrow">
        {t("CHECK AN INSTALLER QUOTE", "安裝商報價篩選")}
      </span>
      <h3>
        {t("Highest acceptable installation quote", "最高可接受安裝總報價")}
      </h3>
      <strong className="quote-ceiling">
        {ceiling == null
          ? "—"
          : ceiling <= 0
            ? t("No positive quote works", "任何正數報價均不划算")
            : money(ceiling)}
      </strong>
      <p>
        {t(
          "At this ceiling, discounted value is zero. A lower quote has positive NPV; your budget and payback goal can be stricter.",
          "此上限對應淨現值為零；更低報價才有正淨現值，預算及回本目標可能要求更低。",
        )}
      </p>
      <div className="finance-line">
        <span>{t("With generation −15%", "發電量下調 15% 後")}</span>
        <strong>{stress == null ? "—" : money(stress)}</strong>
      </div>
      <div className="finance-line">
        <span>{t("Your installation estimate", "目前安裝費估算")}</span>
        <strong>{result ? money(result.initial_cost) : "—"}</strong>
      </div>
      <div className="finance-line">
        <span>{t("Per-kW ceiling, plus setup", "每千瓦上限，另加預留費")}</span>
        <strong>
          {result?.[`max_acceptable_per_kw_${key}`] == null
            ? "—"
            : money(result[`max_acceptable_per_kw_${key}`])}
        </strong>
      </div>
      <p className="microcopy">
        {t(
          `All-in installation = HK$${fmt(inputs.price_per_kw)}/kW + HK$${fmt(inputs.fixed_cost)} setup allowance. If your quote is already all-in, set setup to zero. Maintenance and inverter replacement are separately deducted, not added twice. This is a ${inputs.discount_rate * 100}% discounted, ${inputs.post_fit ? "post-2033 self-use" : "no post-2033 income"} scenario, not a guaranteed price.`,
          `安裝總額 = 每千瓦 HK$${fmt(inputs.price_per_kw)} + 一次性 HK$${fmt(inputs.fixed_cost)} 預留費。若報價已包全部，請把預留費改為零。維護及逆變器更換已另行扣除，不重複計算。採 ${inputs.discount_rate * 100}% 折現及${inputs.post_fit ? "2033 年後自用" : "2033 年後無收入"}情景，不是保證價格。`,
        )}
      </p>
      <p>
        {result?.panels_count
          ? t(
              `${result.panels_count} modules · ${fmt(result.capacity_kw, 2)} kW · sustained payback ${result[`payback_years_${key}`] == null ? "not reached" : `${fmt(result[`payback_years_${key}`], 1)} years`}`,
              `${result.panels_count} 塊面板 · ${fmt(result.capacity_kw, 2)} kW · 持續回本${result[`payback_years_${key}`] == null ? "未達成" : `約 ${fmt(result[`payback_years_${key}`], 1)} 年`}`,
            )
          : t(
              "No modules: payback and quote ceiling do not apply.",
              "沒有面板：回本時間及報價上限不適用。",
            )}
      </p>
      <p className="microcopy">
        {t(
          "FiT ends 31 Dec 2033. Installation delays shorten the revenue window.",
          "上網電價於 2033 年 12 月 31 日結束；投產延後會縮短收入期。",
        )}
      </p>
    </section>
  );
}

export function RadiationEvidence({ check, t }) {
  if (!check) return null;
  const same = check.same_year;
  return (
    <section className="card radiation-evidence">
      <h2>{t("Independent weather-input check", "獨立氣象輸入核對")}</h2>
      <div className="tradeoff-grid">
        <div>
          <strong>{fmt(check.nasa_annual_kwh_m2)} kWh/m²</strong>
          <p>NASA POWER · {check.year}</p>
        </div>
        <div>
          <strong>
            {same ? `${fmt(same.hko_annual_kwh_m2)} kWh/m²` : "—"}
          </strong>
          <p>{t("HKO King's Park · same year", "天文台京士柏 · 同年")}</p>
        </div>
        <div>
          <strong>
            {same
              ? `${fmt(same.difference_pct, 1)}%`
              : t("Not incorporated", "尚未加入")}
          </strong>
          <p>
            {t(
              "NASA minus station, relative to station",
              "NASA 相對觀測站的差異",
            )}
          </p>
        </div>
      </div>
      <p>
        {t(
          "Different locations and calendar boundaries; this checks irradiance inputs, not actual panel generation. No automatic bias correction is applied. Historical normals describe different periods and must not be treated as the same-year truth.",
          "地點及曆年邊界不同；此處核對輻照輸入，不是面板實際發電，亦不自動修正偏差。歷史平均反映不同時期，不能直接當成同年實測值。",
        )}
      </p>
      <p className="microcopy">
        {check.normals.map((n) => (
          <span key={n.period}>
            {n.period}: {fmt(n.annual_kwh_m2)} kWh/m² ·{" "}
            <a href={n.source_url} target="_blank" rel="noreferrer">
              {t("source", "來源")}
            </a>
            {"　"}
          </span>
        ))}
      </p>
      {same && (
        <a href={same.source_url} target="_blank" rel="noreferrer">
          {t(
            "HKO 2025 annual observations, Table 2b",
            "天文台 2025 年觀測年報，表 2b",
          )}
        </a>
      )}
    </section>
  );
}

export function MeasuredReference({ inputs, config, t, onResult }) {
  const [record, setRecord] = useState({
      start_month: 1,
      months: 12,
      generation_kwh: "",
      installed_capacity_kw: "",
      source: "",
    }),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const fingerprint = JSON.stringify({ inputs, config });
  const fresh = result?.fingerprint === fingerprint;
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reference-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs,
          config,
          measurement: {
            ...record,
            generation_kwh: +record.generation_kwh,
            installed_capacity_kw: +record.installed_capacity_kw,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(
          t(
            "Check positive meter generation, capacity, source and months within one year.",
            "請核對正數發電量、容量、來源及同一年內的月份範圍。",
          ),
        );
      setResult({ ...data, fingerprint });
      onResult({ data, fingerprint });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card measured-reference">
      <summary>
        {t("Compare an actual generation-meter record", "對照真實發電電表記錄")}
      </summary>
      <p>
        {t(
          "A measured comparison requires a real village-house generation record. User-supplied records are labelled unverified. Use the roof, shade and weather year matching the installation; enter full calendar months, not household consumption or FiT payment amounts.",
          "實測核對需要真實村屋發電記錄；使用者提供的資料會標示尚未獨立核實。請設定與安裝案例相符的天台、遮擋及氣象年份；輸入完整曆月的發電度數，並非家居用電量或上網電價款項。",
        )}
      </p>
      <form onSubmit={run}>
        <div className="field-pair">
          <NumberField
            label={t("First calendar month", "首個曆月")}
            value={record.start_month}
            min={1}
            max={12}
            onChange={(v) =>
              setRecord({ ...record, start_month: Math.round(v) })
            }
          />
          <NumberField
            label={t("Number of full months", "完整月份數")}
            value={record.months}
            min={1}
            max={12}
            onChange={(v) => setRecord({ ...record, months: Math.round(v) })}
          />
        </div>
        <div className="field-pair">
          {[
            ["generation_kwh", t("Meter generation kWh", "電表發電量 kWh")],
            [
              "installed_capacity_kw",
              t("Actual installed capacity kW", "實際裝機容量 kW"),
            ],
          ].map(([key, label]) => (
            <label className="number-field" key={key}>
              <span>{label}</span>
              <div>
                <input
                  aria-label={label}
                  type="number"
                  required
                  min="0.001"
                  step="any"
                  value={record[key]}
                  onChange={(e) =>
                    setRecord({ ...record, [key]: e.target.value })
                  }
                />
              </div>
            </label>
          ))}
        </div>
        <label className="text-field">
          {t("Record source / period", "記錄來源／期間")}
          <input
            required
            maxLength={300}
            aria-label={t("Record source / period", "記錄來源／期間")}
            value={record.source}
            onChange={(e) => setRecord({ ...record, source: e.target.value })}
          />
        </label>
        <button className="text-button" disabled={busy}>
          {t("Compare meter record", "核對電表記錄")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {fresh && (
        <p>
          {t(
            `Model ${fmt(result.predicted_kwh)} kWh; measured ${fmt(result.measurement.generation_kwh)} kWh; relative difference ${fmt(result.difference_pct, 1)}%. Model normalised to the stated capacity. User-supplied evidence is not independently verified.`,
            `模型 ${fmt(result.predicted_kwh)} kWh；實測 ${fmt(result.measurement.generation_kwh)} kWh；相對差異 ${fmt(result.difference_pct, 1)}%。模型按所填容量正規化，使用者提供的記錄尚未獨立核實。`,
          )}
        </p>
      )}
      {result && !fresh && (
        <p>
          {t(
            "Inputs changed; rerun this comparison.",
            "輸入已改變，請重新核對。",
          )}
        </p>
      )}
    </details>
  );
}

export function niceTicks(curve) {
  const values = curve.flatMap((p) => [p.A, p.B]).filter(Number.isFinite);
  const lo = Math.min(0, ...values),
    hi = Math.max(0, ...values),
    raw = (hi - lo) / 5 || 1000;
  const power = 10 ** Math.floor(Math.log10(raw)),
    normal = raw / power;
  const step =
    (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * power;
  const min = Math.floor(lo / step) * step,
    max = Math.ceil(hi / step) * step;
  return Array.from(
    { length: Math.max(2, Math.round((max - min) / step) + 1) },
    (_, i) => min + i * step,
  );
}
