import React from "react";
import { ArrowDown, Check, Info, X } from "lucide-react";
import { NumberField } from "./Controls.jsx";
import { fmt, money } from "../lib/format.js";

export const reasonText = (reason, t) =>
  ({
    minimum_capacity: t(
      "Below the selected minimum practical system size",
      "低於所選最小實用系統容量",
    ),
    physical: t("Preliminary physical checks failed", "未通過初步物理條件"),
    budget: t("Over budget", "超出預算"),
    profit: t(
      "Net cash flow or NPV is not positive",
      "淨現金流或淨現值未達正數",
    ),
    payback: t(
      "No sustained payback within your target",
      "未在目標年期內持續回本",
    ),
  })[reason] || reason;
export function DecisionControls({ inputs, change, t }) {
  return (
    <section className="card goals-card">
      <div>
        <strong>
          {t("What should the design achieve?", "你希望方案達到甚麼目標？")}
        </strong>
        <p className="microcopy">
          {t(
            "Enable a cap to screen by budget or payback. Minimum system size is a practical screening assumption, not a legal limit.",
            "勾選上限以按預算或回本期篩選。最小系統容量是實用篩選假設，並非法例下限。",
          )}
        </p>
      </div>
      <div>
        <label className="goal-checkbox">
          <input
            type="checkbox"
            checked={inputs.budget > 0}
            onChange={(e) => change("budget", e.target.checked ? 200000 : 0)}
          />
          {t("Limit installation budget", "設定安裝預算上限")}
        </label>
        {inputs.budget > 0 && (
          <NumberField
            label={t("Budget cap", "預算上限")}
            value={inputs.budget}
            max={10000000}
            unit="HK$"
            onChange={(v) => change("budget", v)}
          />
        )}
      </div>
      <div>
        <label className="goal-checkbox">
          <input
            type="checkbox"
            checked={inputs.max_payback_years > 0}
            onChange={(e) =>
              change("max_payback_years", e.target.checked ? 7 : 0)
            }
          />
          {t("Limit sustained payback time", "設定持續回本期限")}
        </label>
        {inputs.max_payback_years > 0 && (
          <NumberField
            label={t("Sustained payback within", "持續回本期限")}
            value={inputs.max_payback_years}
            max={25}
            step={0.5}
            unit={t("years", "年")}
            onChange={(v) => change("max_payback_years", v)}
          />
        )}
      </div>
      <NumberField
        label={t("Minimum system capacity", "最小系統容量")}
        value={inputs.minimum_capacity_kw}
        max={20}
        step={0.1}
        unit="kW"
        onChange={(v) => change("minimum_capacity_kw", v)}
      />
      <label className="goal-checkbox">
        <input
          type="checkbox"
          checked={inputs.require_profit}
          onChange={(e) => change("require_profit", e.target.checked)}
        />
        {t(
          "Require positive net cash flow and NPV",
          "要求淨現金流及淨現值為正",
        )}
      </label>
    </section>
  );
}
export function DecisionBanner({ result, search, loading, t, onJump, sample }) {
  const ready = result && !loading;
  const eligible = ready && result.decision?.eligible;
  const defer = search?.verdict === "defer_installation";
  return (
    <section
      className={`decision-banner ${ready && !eligible ? "caution" : ""}`}
      aria-live="polite"
    >
      <div>
        <span className="eyebrow">{t("YOUR DECISION", "你的決策")}</span>
        <h2>
          {sample
            ? t(
                "Example rooftop — replace the assumptions",
                "示例天台：請改為你的實際資料",
              )
            : !ready
              ? t("Checking your goals…", "正在核對目標…")
              : defer
                ? t("Consider deferring installation", "可考慮暫緩安裝")
                : eligible
                  ? t(
                      "Current design meets the selected screening criteria",
                      "當前設計符合所選篩選條件",
                    )
                  : t(
                      "Current design does not meet the selected criteria",
                      "當前設計未達所選條件",
                    )}
        </h2>
        <p>
          {sample
            ? t(
                "This is a calculated example, not a recommendation for your property. Enter measured roof dimensions and an actual installation quote before deciding.",
                "這是模型計算示例，並非對你物業的建議。請填入實測天台尺寸及真實安裝商報價，再作決定。",
              )
            : ready
              ? eligible
                ? t(
                    "Within the selected constraints and financial assumptions. Compare alternatives and check sensitivity before choosing.",
                    "在所選條件與財務假設下達標。選擇前請比較其他方案及敏感性。",
                  )
                : result.decision?.reasons
                    .map((r) => reasonText(r, t))
                    .join(" · ")
              : t(
                  "Results update when your inputs change.",
                  "輸入改變後會重新計算。",
                )}
        </p>
        {defer && (
          <p>
            {t(
              "No searched design meets all goals. Not installing has HK$0 solar investment, HK$0 incremental solar cash flow and 0 kWh solar generation; ordinary electricity bills are outside this comparison.",
              "搜尋範圍內沒有方案符合全部目標。不安裝的太陽能投資及增量現金流均為 HK$0，太陽能發電為 0 kWh；兩種方案均未計一般電費。",
            )}
          </p>
        )}
      </div>
      <button className="primary-action" onClick={onJump}>
        {t("Compare choices", "比較選擇")}
        <ArrowDown size={15} />
      </button>
    </section>
  );
}
export function TradeoffSummary({ result, t, onCompare }) {
  const list =
    result?.row_comparison?.filter((r) => r.compliant && r.panels_count > 0) ||
    [];
  if (list.length < 2)
    return (
      <section className="card physical-tradeoff">
        <strong>{t("Physical trade-off", "物理取捨")}</strong>
        <p>
          {t(
            "This roof cannot fit two neighbouring row-count options under the selected checks. Adjust geometry or tilt to explore a comparison.",
            "所選條件下無法放置兩個相鄰排數的可行方案。可調整面積或傾角再比較。",
          )}
        </p>
      </section>
    );
  const a = list[0],
    b = list[1],
    energy = b.annual_kwh - a.annual_kwh,
    cost = b.initial_cost - a.initial_cost;
  const efficiency = b.specific_yield - a.specific_yield;
  return (
    <section className="card physical-tradeoff">
      <div className="card-title">
        <h2>
          {t("More panels. What do you give up?", "增加面板，需要付出甚麼？")}
        </h2>
        <button className="text-button" onClick={() => onCompare([a, b])}>
          {t("Save this pair as A/B", "把這兩個方案存為 A/B")}
        </button>
      </div>
      <div className="tradeoff-grid">
        <div>
          <strong>
            {a.actual_rows ?? a.config.rows} → {b.actual_rows ?? b.config.rows}{" "}
            {t("rows", "排")}
          </strong>
          <p>
            {a.panels_count} → {b.panels_count} {t("modules", "塊面板")}
          </p>
        </div>
        <div>
          <strong>
            {energy >= 0 ? "+" : ""}
            {fmt(energy)} kWh
          </strong>
          <p>{t("Annual generation change", "年發電量變化")}</p>
        </div>
        <div>
          <strong>
            {cost >= 0 ? "+" : ""}
            {money(cost)}
          </strong>
          <p>{t("Extra investment", "新增投資")}</p>
        </div>
        <div>
          <strong>
            {efficiency >= 0 ? "+" : ""}
            {fmt(efficiency, 1)} kWh/kW
          </strong>
          <p>{t("Specific-yield change", "單位容量發電量變化")}</p>
        </div>
      </div>
      <p>
        {t(
          `Shade loss: ${a.shading_loss_pct}% → ${b.shading_loss_pct}%. More modules can increase total energy while reducing energy per installed kW. Geometry and weather determine whether that happens here.`,
          `遮擋損失：${a.shading_loss_pct}% → ${b.shading_loss_pct}%。增加面板可提升總發電，但可能降低每千瓦發電量；是否出現此取捨，取決於排布及氣象。`,
        )}
      </p>
      {cost > 0 && energy > 0 && (
        <p className="microcopy">
          {t(
            "Marginal annual energy per extra HK$1,000",
            "每新增 HK$1,000 投資的邊際年發電",
          )}
          : {fmt((energy / cost) * 1000, 1)} kWh ·{" "}
          {t(
            "Same tilt, direction, roof and weather; simulated.",
            "傾角、朝向、屋頂及氣象相同；結果為模擬。",
          )}
        </p>
      )}
    </section>
  );
}
export function EngineeringControls({ inputs, change, t }) {
  const update = (index, key, value) =>
    change(
      "exclusions",
      inputs.exclusions.map((o, i) =>
        i === index ? { ...o, [key]: value } : o,
      ),
    );
  return (
    <details className="advanced-finance engineering-controls">
      <summary>
        {t("Engineering, sources & uncertainty", "工程、來源與不確定性")}
      </summary>
      <NumberField
        label={t("Minimum row fill versus south", "每排板數相對朝南的最低比例")}
        value={inputs.minimum_row_fill_ratio * 100}
        min={0}
        max={100}
        unit="%"
        onChange={(v) => change("minimum_row_fill_ratio", v / 100)}
      />
      <p className="microcopy">
        {t(
          "70% is an editable layout-quality assumption, not a legal limit. Explicit module caps allow intentionally partial rows.",
          "70% 是可調的排布品質假設，並非法例限制。明確設定面板上限時可保留非整排。",
        )}
      </p>
      <label className="select-field">
        {t("Reference weather year", "參考氣象年份")}
        <select
          aria-label={t("Reference weather year", "參考氣象年份")}
          value={inputs.weather_year}
          onChange={(e) => change("weather_year", +e.target.value)}
        >
          {[2023, 2024, 2025].map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <div className="field-pair">
        <NumberField
          label={t("Discount rate", "折現率")}
          value={Math.round(inputs.discount_rate * 10000) / 100}
          unit="%"
          max={30}
          step={0.5}
          onChange={(v) => change("discount_rate", v / 100)}
        />
        <NumberField
          label={t("Cost inflation", "費用年通脹")}
          value={Math.round(inputs.cost_inflation * 10000) / 100}
          unit="%"
          max={15}
          step={0.5}
          onChange={(v) => change("cost_inflation", v / 100)}
        />
      </div>
      <p className="microcopy">
        {t(
          "Rates are entered as percentages. Simple cash flow and discounted NPV are both reported; taxes and financing are excluded.",
          "比率以百分比輸入。同時報告簡單現金流與折現淨現值，未計稅項及融資。",
        )}
      </p>
      <div className="field-pair">
        <NumberField
          label={t("Additional mass / module", "每板額外重量")}
          value={inputs.extra_mass_per_module}
          max={500}
          unit="kg"
          onChange={(v) => change("extra_mass_per_module", v)}
        />
        <NumberField
          label={t("Selected load limit", "所選荷載上限")}
          value={inputs.load_limit}
          min={1}
          max={150}
          unit="kg/m²"
          onChange={(v) => change("load_limit", v)}
        />
      </div>
      <p className="microcopy">
        {t(
          "150 kg/m² roof limit; stairhood has a 75 kg/m² limit. Includes added assumed mass, but not wind forces, fixing design, support locations or structural approval. Continuous-cover case only; grouped installations are not assessed.",
          "屋頂上限 150 kg/m²，樓梯頂篷為 75 kg/m²。可加入假設額外重量，未評估風力、固定設計、支承位置或結構批准。只檢查連續覆蓋，未評估群組安裝。",
        )}
      </p>
      <label className="goal-checkbox">
        <input
          type="checkbox"
          checked={inputs.finite_rows}
          onChange={(e) => change("finite_rows", e.target.checked)}
        />
        {t(
          "Account for finite adjacent-row overlap",
          "計算相鄰排有限長度的重疊",
        )}
      </label>
      <label className="select-field">
        {t("Electrical shading assumption", "電氣遮陰假設")}
        <select
          aria-label={t("Electrical shading assumption", "電氣遮陰假設")}
          value={inputs.electrical_model}
          onChange={(e) => change("electrical_model", e.target.value)}
        >
          <option value="linear">
            {t("Linear beam loss", "線性直射光損失")}
          </option>
          <option value="martinez">
            {t("Martinez bypass-block approximation", "Martinez 旁路區塊近似")}
          </option>
        </select>
      </label>
      {inputs.electrical_model === "martinez" && (
        <NumberField
          label={t("Assumed blocks along module", "沿面板方向假設區塊數")}
          value={inputs.bypass_blocks}
          min={1}
          max={6}
          onChange={(v) => change("bypass_blocks", Math.round(v))}
        />
      )}
      <p className="microcopy">
        {t(
          "Electrical block layout is an assumption, not a verified module wiring design. Finite-row correction models adjacent segments; distant-row and diffuse self-shading remain omitted.",
          "電氣區塊排布屬假設，未核對商品接線。有限排長修正處理相鄰排，未計更遠排及排間散射遮陰。",
        )}
      </p>
      <label className="text-field">
        {t("Quote reference", "報價依據")}
        <input
          aria-label={t("Quote reference", "報價依據")}
          maxLength={300}
          value={inputs.quote_source}
          onChange={(e) => change("quote_source", e.target.value)}
        />
      </label>
      <label className="date-label">
        {t("Quote date", "報價日期")}
        <input
          type="date"
          aria-label={t("Quote date", "報價日期")}
          value={inputs.quote_date}
          onChange={(e) => change("quote_date", e.target.value)}
        />
      </label>
      <label className="text-field">
        {t("Module specification reference", "面板規格依據")}
        <input
          aria-label={t("Module specification reference", "面板規格依據")}
          maxLength={300}
          value={inputs.panel_source}
          onChange={(e) => change("panel_source", e.target.value)}
        />
      </label>
      <p className="microcopy">
        {t(
          "References record provenance; editing text does not change the assumed 450 W module specification. EMSD describes system costs as several tens of thousands of HK$ per kW; the editable default is illustrative and must be replaced with an actual quote.",
          "文字用於記錄來源，不會改變假設的 450 W 規格。機電署概述系統成本為每千瓦數萬元；預設費用為示例，應以真實報價代替。",
        )}{" "}
        <a
          href="https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20%28TC%29.pdf"
          target="_blank"
          rel="noreferrer"
        >
          {t("EMSD FAQ 1.8", "機電署 FAQ 1.8")}
        </a>
      </p>
      <strong>
        {t("Rooftop objects / exclusion rectangles", "天台物件／預留矩形區域")}
      </strong>
      <p className="microcopy">
        {t(
          "Measure x eastward, y northward in roof coordinates from the south-west corner. Module footprints avoid these rectangles. Direct-beam shadows use a module-centre ray approximation; partial shadows and diffuse blockage are not solved.",
          "由天台座標左下角起量度，x 向東、y 向北。面板避開這些矩形；直射陰影採面板中心光線近似，未完整求解局部陰影及散射遮擋。",
        )}
      </p>
      {inputs.exclusions.map((o, index) => (
        <div className="obstacle-fields" key={index}>
          <div className="card-title">
            <strong>
              {t("Object", "物件")} {index + 1}
            </strong>
            <button
              className="icon-button"
              aria-label={t("Remove object", "移除物件")}
              onClick={() =>
                change(
                  "exclusions",
                  inputs.exclusions.filter((_, i) => i !== index),
                )
              }
            >
              <X size={14} />
            </button>
          </div>
          <div className="field-pair">
            {["x", "y", "width", "depth", "height"].map((key) => (
              <NumberField
                key={key}
                label={`${t("Object", "物件")} ${index + 1} ${t(key, { x: "x", y: "y", width: "寬", depth: "深", height: "高" }[key])}`}
                value={o[key]}
                min={key === "width" || key === "depth" ? 0.1 : 0}
                max={key === "height" ? 6 : 30}
                step={0.1}
                onChange={(v) => update(index, key, v)}
                unit="m"
              />
            ))}
          </div>
        </div>
      ))}
      <button
        className="text-button"
        disabled={inputs.exclusions.length >= 6}
        onClick={() =>
          change("exclusions", [
            ...inputs.exclusions,
            {
              x: 0,
              y: 0,
              width: Math.min(1, inputs.width),
              depth: Math.min(1, inputs.depth),
              height: 1,
            },
          ])
        }
      >
        {t("Add rooftop object", "加入天台物件")}
      </button>
    </details>
  );
}
