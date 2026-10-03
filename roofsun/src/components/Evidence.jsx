import React from "react";
import { fmt, money } from "../lib/format.js";
const titles = {
  quote_minus_20: ["Quote −20%", "報價 −20%"],
  quote_plus_20: ["Quote +20%", "報價 +20%"],
  delay_6_months: ["Complete 6 months later", "遲 6 個月投產"],
  delay_12_months: ["Complete 12 months later", "遲 12 個月投產"],
  neighbour_plus_floor: ["Neighbour one floor higher", "鄰屋高一層"],
  high_other_costs: ["High other costs", "其他費用高檔"],
  linear_electrical: ["Linear shading calculation", "線性電氣遮擋"],
  weather_2023: ["2023 weather", "2023 年天氣"],
  weather_2024: ["2024 weather", "2024 年天氣"],
};
export function verdictText(value, t) {
  return t(
    ...({
      worthwhile: ["Worth considering", "值得裝"],
      marginal: ["Marginal", "勉強"],
      not_recommended: ["Not recommended", "不建議"],
    }[value] || ["Calculating…", "正在計算…"]),
  );
}
export function NpvRange({ interval, t }) {
  if (!interval)
    return (
      <p>{t("No feasible reference configuration.", "沒有可用的參考配置。")}</p>
    );
  const points = interval.points,
    lo = Math.min(0, interval.min),
    hi = Math.max(0, interval.max),
    span = Math.max(1, hi - lo);
  const position = (n) => `${8 + (84 * (n - lo)) / span}%`;
  return (
    <div className="npv-range">
      <div
        className="range-track"
        role="img"
        aria-label={t(
          `NPV scenarios from HK$${Math.round(interval.min)} to HK$${Math.round(interval.max)}`,
          `淨現值情景由 HK$${Math.round(interval.min)} 至 HK$${Math.round(interval.max)}`,
        )}
      >
        <span className="range-zero" style={{ left: position(0) }}>
          0
        </span>
        {points.map((p) => (
          <span
            key={p.id}
            className={`range-dot ${p.id}`}
            style={{ left: position(p.npv) }}
            title={`${p.id}: ${money(p.npv)}`}
          />
        ))}
      </div>
      <div className="range-values">
        {points.map((p, i) => (
          <div key={p.id}>
            <span className={`dot-key ${p.id}`} />
            <span>
              {t(
                ...[
                  ["Conservative", "保守"],
                  ["Current", "當前"],
                  ["Optimistic", "樂觀"],
                ][i],
              )}
            </span>
            <strong>{money(p.npv)}</strong>
            <small>
              {t("Weather", "天氣")} ×{p.weather_scale.toFixed(3)} ·{" "}
              {fmt(p.discount_rate * 100)}% {t("discount", "折現")}
            </small>
          </div>
        ))}
      </div>
      <p className="help">
        {t(
          "Same configuration in three scenarios. This range is not a confidence interval or a probability.",
          "同一配置的三個情景。這個範圍並非置信區間或發生機率。",
        )}
      </p>
    </div>
  );
}
export default function Evidence({
  calibration,
  validation,
  analysis,
  loading,
  error,
  onAnalyse,
  t,
  interval,
  exploring,
}) {
  const check = (name) => validation?.checks?.find((c) => c.name_en === name);
  return (
    <div className="evidence-content">
      <h3>{t("A. Does the model check out?", "A. 模型核對")}</h3>
      <section className="evidence-block">
        <h4>{t("NASA versus HKO observations", "NASA 與天文台實測對比")}</h4>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Year", "年份")}</th>
                <th>NASA kWh/m²</th>
                <th>{t("HKO kWh/m²", "天文台 kWh/m²")}</th>
                <th>{t("HKO / NASA", "天文台 / NASA")}</th>
                <th>{t("Incomplete days", "不完整日數")}</th>
              </tr>
            </thead>
            <tbody>
              {calibration?.years?.map((r) => (
                <tr key={r.year}>
                  <th>{r.year}</th>
                  <td>{fmt(r.nasa_kwh_m2, 1)}</td>
                  <td>{fmt(r.hko_kwh_m2, 1)}</td>
                  <td>{r.ratio.toFixed(3)}</td>
                  <td>{r.flagged_days.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {t(
            "HKO provides daily totals; row shadows need hourly sunlight. We retain NASA’s hourly pattern and scale the annual total. King’s Park is in Kowloon, so this may be conservative for some New Territories roofs. Different locations and calendar boundaries remain a limitation.",
            "天文台提供每日總量，排間陰影需要逐小時日照。因此保留 NASA 的逐時形狀，再調整全年總量。京士柏位於九龍，對部分新界天台可能偏保守；地點及曆年邊界不同仍是限制。",
          )}
        </p>
        <p className="help">
          {t(
            "Days marked # retain the reported incomplete total; no daily values are invented. The three-year combined multiplier is",
            "標示 # 的日子保留原始不完整總量，沒有補造每日數值。三年合計比例為",
          )}{" "}
          {calibration?.combined_ratio?.toFixed(6)}.{" "}
          <a href={calibration?.source_url} target="_blank" rel="noreferrer">
            {t("HKO source CSV", "天文台原始 CSV")}
          </a>
        </p>
      </section>
      <div className="evidence-pair">
        <section className="evidence-block">
          <h4>{t("Solar position: NREL SPA", "太陽位置：NREL SPA")}</h4>
          <p>
            {t(
              "Checked against the published example, with angular error below 0.00001°.",
              "與公開例子核對，角度誤差小於 0.00001°。",
            )}
          </p>
          <code>
            {check("Published solar-position benchmark")?.observed ||
              t("Loading verification…", "正在載入驗證…")}
          </code>
          <a
            href="https://www.nrel.gov/docs/fy08osti/34302.pdf"
            target="_blank"
            rel="noreferrer"
          >
            NREL SPA
          </a>
        </section>
        <section className="evidence-block">
          <h4>{t("Row-shadow geometry", "前後排遮擋幾何")}</h4>
          <p>
            {t(
              "25 reference cases compared with pvlib. This verifies the geometry implementation, not measured electrical output.",
              "25 個情景與 pvlib 對照。這是幾何實作核對，並非實測電力輸出。",
            )}
          </p>
          <code>
            {check("Row-shadow geometry cross-check")?.observed || "…"}
          </code>
        </section>
      </div>
      <section className="evidence-block">
        <h4>
          {t(
            "Whole-generation cross-check with pvlib ModelChain",
            "與 pvlib ModelChain 交叉核對完整發電流程",
          )}
        </h4>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Tilt", "傾角")}</th>
                <th>RoofSun kWh</th>
                <th>ModelChain kWh</th>
                <th>{t("Difference", "差距")}</th>
              </tr>
            </thead>
            <tbody>
              {validation?.references?.map((r) => (
                <tr key={r.configuration.tilt}>
                  <th>{r.configuration.tilt}°</th>
                  <td>{fmt(r.roofsun_kwh)}</td>
                  <td>{fmt(r.reference_kwh)}</td>
                  <td>{fmt(r.difference_pct, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {t(
            "Two models compared using shared weather. Temperature, losses and inverter assumptions differ. This is not a comparison with measured rooftop generation.",
            "兩個模型使用共同氣象資料作對照；溫度、損耗及逆變器假設不同。這不是與天台實測發電量的比較。",
          )}
        </p>
      </section>
      <section className="evidence-block pending-case">
        <h4>{t("Real village-house reference case", "真實村屋參考案例")}</h4>
        <strong>{t("Pending data", "待補充")}</strong>
        <p>
          {t(
            "No generation-meter record has been supplied. No example readings or accuracy figures are shown.",
            "尚未提供發電錶紀錄，不顯示示例讀數或實測準確率。",
          )}
        </p>
      </section>
      <h3>{t("B. How stable is the conclusion?", "B. 結論有多穩？")}</h3>
      <h4>
        {t(
          "Three NPV scenarios for the recommended configuration",
          "推薦配置的三個淨現值情景",
        )}
      </h4>
      {exploring && (
        <p className="help">
          {t(
            "The interval below is for the system recommendation, not the extra-row exploration shown above.",
            "以下區間針對系統推薦配置，與上方增減排數探索的配置分開計算。",
          )}
        </p>
      )}
      <NpvRange interval={analysis?.interval || interval} t={t} />
      <div className="analysis-heading">
        <h4>{t("What could change the conclusion?", "甚麼會改變結論？")}</h4>
        <button
          className="primary-button"
          disabled={loading}
          onClick={onAnalyse}
        >
          {loading
            ? t("Calculating scenarios…", "正在計算情景…")
            : t("Run sensitivity checks", "計算敏感性")}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-notice">
          {t(
            "Sensitivity checks failed; please retry.",
            "敏感性計算失敗，請重試。",
          )}
        </p>
      )}
      {analysis?.available === false && (
        <p>
          {t(
            "No feasible reference system under these inputs.",
            "這組輸入沒有可行的參考系統。",
          )}
        </p>
      )}
      {analysis?.scenarios?.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Change one input", "每次改一項")}</th>
                <th>NPV HK$</th>
                <th>{t("Conclusion", "結論")}</th>
                <th>{t("Recommendation changes?", "推薦配置改變？")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.scenarios.map((s) => (
                <tr key={s.id}>
                  <th>{t(...titles[s.id])}</th>
                  <td>{money(s.npv)}</td>
                  <td>{verdictText(s.verdict, t)}</td>
                  <td>
                    {s.recommendation_changed
                      ? t("Yes", "會")
                      : t("No", "不會")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="help">
        {t(
          "Financial effects and conclusions use the current recommended design. The final column separately searches again to check whether another design becomes preferable.",
          "財務影響與結論按當前推薦配置計算；最後一欄另行搜尋，檢查是否改選其他配置。",
        )}
      </p>
      <h4>{t("What is outside the model?", "模型沒有考慮甚麼？")}</h4>
      <p>
        {t(
          "Typhoon wind loads and ballast; pollution other than the generic dust allowance; neighbours to the east, west and north; non-rectangular roofs; grouped installations; stairhood installations; inverter clipping; changes to electricity tariffs.",
          "颱風風荷載及壓重；一般灰塵假設以外的污染；東、西、北三面的鄰屋；非長方形天台；群組式安裝；樓梯屋頂安裝；逆變器削峰；電價調整。",
        )}
      </p>
    </div>
  );
}
