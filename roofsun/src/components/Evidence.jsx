import React, { useMemo, useState } from "react";
import { useApi } from "../lib/api.js";
import { fmt, money } from "../lib/format.js";
import { reasonText } from "./Decision.jsx";
const labels = {
  quote_30000: ["Illustrative HK$30,000/kW quote", "示例 HK$30,000/kW 報價"],
  base: ["Current assumptions", "當前假設"],
  weather_minus_15: ["Irradiance input −15%", "輻照輸入 −15%"],
  weather_minus_10: ["Irradiance −10%", "輻照 −10%"],
  weather_plus_10: ["Irradiance +10%", "輻照 +10%"],
  quote_minus_20: ["Quote −20%", "報價 −20%"],
  quote_plus_20: ["Quote +20%", "報價 +20%"],
  horizon_plus_5: ["Horizon +5°", "遮擋仰角 +5°"],
  horizon_minus_5: ["Horizon −5°", "遮擋仰角 −5°"],
  delay_6_months: ["Commissioning +6 months", "投產延後 6 個月"],
  electrical_alternative: ["Other electrical shade model", "另一電氣遮陰模型"],
  row_geometry_alternative: ["Other finite-row assumption", "另一有限排長假設"],
};
export function ReferenceEvidence({ reference, t }) {
  if (!reference) return null;
  if (reference.available === false)
    return (
      <p className="violation">
        {t(
          "A complete module does not fit the reference roof; generation reference comparison is unavailable.",
          "參考屋頂無法放置完整面板，因此不能進行發電量參考比較。",
        )}
      </p>
    );
  return (
    <section className="reference-evidence">
      <h3>
        {t("Whole-generation reference comparison", "完整發電流程參考核對")}
      </h3>
      <p>
        {t(
          "A single-row, unobstructed case with the same weather, capacity and orientation. ModelChain uses PVWatts DC / inverter, SAPM temperature and assumed 1 m/s wind; RoofSun uses NOCT and a 0.85 system factor. Shared pvlib components mean this is a cross-model comparison, not independent measured accuracy.",
          "同氣象、容量及朝向的單排無遮擋案例。ModelChain 採 PVWatts 直流／逆變器、SAPM 溫度及假設 1 m/s 風速；RoofSun 採 NOCT 和 0.85 系統係數。兩者共享 pvlib 元件，屬模型交叉核對，並非獨立實測準確率。",
        )}
      </p>
      <div className="tradeoff-grid">
        <div>
          <strong>{fmt(reference.roofsun_kwh)} kWh</strong>
          <p>RoofSun</p>
        </div>
        <div>
          <strong>{fmt(reference.reference_kwh)} kWh</strong>
          <p>ModelChain / PVWatts</p>
        </div>
        <div>
          <strong>{fmt(reference.difference_pct, 2)}%</strong>
          <p>{t("Relative difference", "相對差異")}</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Month", "月份")}</th>
              <th>RoofSun kWh</th>
              <th>ModelChain kWh</th>
            </tr>
          </thead>
          <tbody>
            {reference.monthly.map((m) => (
              <tr key={m.month}>
                <td>{m.month}</td>
                <td>{fmt(m.roofsun_kwh, 1)}</td>
                <td>{fmt(m.reference_kwh, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="microcopy">
        {t(
          "Differences reflect temperature, losses and inverter assumptions; they are not an estimate of error against a real roof. No accuracy percentage is claimed.",
          "差異反映溫度、損失及逆變器假設，不能當成與真實屋頂相比的誤差，不宣稱實測準確率。",
        )}
      </p>
      <a
        className="text-button"
        href={reference.source_url}
        target="_blank"
        rel="noreferrer"
      >
        {t("Reference method", "參考方法")} · pvlib{" "}
        {reference.reference_version}
      </a>
    </section>
  );
}
export default function Evidence({ inputs, config, t, onEvidence }) {
  const [request, setRequest] = useState(null);
  const enabled = Boolean(request);
  const body = request;
  const stale =
    enabled && JSON.stringify(request) !== JSON.stringify({ inputs, config });
  const { data, loading, error } = useApi("/api/analyse", body, 800, enabled);
  React.useEffect(() => {
    onEvidence(data && !loading && !error && !stale ? data : null);
  }, [data, loading, error, onEvidence, stale]);
  return (
    <section className="card evidence-card" id="evidence">
      <div className="card-title">
        <h2>{t("How dependable is this choice?", "這個選擇有多穩健？")}</h2>
        <button
          className="primary-action"
          onClick={() => setRequest(structuredClone({ inputs, config }))}
          disabled={enabled && loading}
        >
          {!enabled
            ? t("Run sensitivity & reference checks", "執行敏感性及參考核對")
            : loading
              ? t("Analysing…", "正在分析…")
              : t("Run again", "重新執行")}
        </button>
      </div>
      <p>
        {t(
          "Three historical weather years, one-at-a-time input changes and a reference generation pipeline. This is a scenario envelope, not a confidence interval, P90 forecast or measured accuracy claim.",
          "比較三個歷史氣象年份、單項輸入變化及參考發電流程。結果是情景範圍，並非置信區間、P90 預測或實測準確率。",
        )}
      </p>
      {enabled && loading && (
        <p role="status">
          {t(
            "Calculating alternative weather years and recommendations. First run can take several seconds; financial edits reuse physical search results.",
            "正在計算不同氣象年份及推薦。首次執行可能需數秒；財務修改會重用物理搜尋結果。",
          )}
        </p>
      )}
      {stale && (
        <p className="violation">
          {t(
            "Inputs changed. Run the analysis again; old evidence is excluded from exports.",
            "輸入已改變，請重新執行分析。匯出時不會使用舊證據。",
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="violation">
          {error}
        </p>
      )}
      {enabled && !loading && data && !stale && (
        <>
          <div className="tradeoff-grid">
            <div>
              <strong>
                {fmt(data.range.annual_kwh[0])}–{fmt(data.range.annual_kwh[1])}{" "}
                kWh
              </strong>
              <p>{t("Current-layout scenario range", "當前布局情景範圍")}</p>
            </div>
            <div>
              <strong>
                {money(data.range.npv[0])} → {money(data.range.npv[1])}
              </strong>
              <p>{t("NPV scenario range", "淨現值情景範圍")}</p>
            </div>
            <div>
              <strong>
                {data.ranking_stable
                  ? t("Unchanged choice", "選擇維持不變")
                  : t("Choice changes", "選擇會改變")}
              </strong>
              <p>
                {t(
                  "Across the tested recommendation scenarios",
                  "在已測試推薦情景之間",
                )}
              </p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Scenario", "情景")}</th>
                  <th>kWh/{t("yr", "年")}</th>
                  <th>{t("NPV", "淨現值")}</th>
                  <th>{t("Goal check", "目標檢查")}</th>
                </tr>
              </thead>
              <tbody>
                {data.scenarios.map((s) => (
                  <tr key={s.id}>
                    <td>{t(...labels[s.id])}</td>
                    <td>{fmt(s.annual_kwh)}</td>
                    <td>{money(s.npv)}</td>
                    <td>
                      {s.decision.eligible
                        ? t("Meets goals", "達標")
                        : s.decision.reasons
                            .map((r) => reasonText(r, t))
                            .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>{t("Historical weather variation", "歷史氣象變化")}</h3>
          <div className="tradeoff-grid">
            {data.weather_years.map((y) => (
              <div key={y.year}>
                <strong>
                  {y.year} · {fmt(y.annual_kwh)} kWh
                </strong>
                <p>
                  {y.hours} {t("weather hours", "小時氣象資料")} ·{" "}
                  {t("NPV", "淨現值")} {money(y.npv)}
                </p>
              </div>
            ))}
          </div>
          <h3>{t("Does the recommendation change?", "推薦是否改變？")}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Condition", "條件")}</th>
                  <th>{t("Highest-NPV configuration", "最高淨現值配置")}</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((r, i) => (
                  <tr key={i}>
                    <td>{r.year || t(...labels[r.scenario])}</td>
                    <td>
                      {r.config
                        ? `${r.config.tilt}° / ${r.config.azimuth}° / ${r.config.rows} ${t("rows", "排")}`
                        : t("Defer installation", "暫緩安裝")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ReferenceEvidence reference={data.reference} t={t} />
        </>
      )}
    </section>
  );
}
