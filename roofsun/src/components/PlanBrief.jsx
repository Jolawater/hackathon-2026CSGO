import React, { useState } from "react";
import { fmt, money } from "../lib/format.js";

export default function PlanBrief({
  inputs,
  search,
  loading,
  pending,
  t,
  onChoose,
}) {
  const [priority, setPriority] = useState("payback");
  const plan = search?.recommendations?.[priority];
  const goals = [
    ["npv", t("Long-term value", "長期更划算")],
    ["payback", t("Recover spending sooner", "較快回本")],
    ["economy", t("Lower upfront spending", "先少花錢")],
    ["generation", t("More electricity", "多發電")],
  ];
  return (
    <section className="plan-brief card">
      <span className="eyebrow">
        {t("YOUR PLAN IN PLAIN WORDS", "不用看圖，也能看懂建議")}
      </span>
      <h2>
        {t(
          "Based on your conditions, start here.",
          "根據你的條件，建議這樣裝。",
        )}
      </h2>
      <p>
        {t(
          `Roof ${inputs.width} × ${inputs.depth} m; ${Math.max(...inputs.horizon) > 0 ? "neighbour shading included" : "no neighbour shading entered"}; ${inputs.budget ? "budget " + money(inputs.budget) : "no spending cap set"}; quote ${money(inputs.price_per_kw)}/kW + ${money(inputs.fixed_cost)}; compare ${inputs.analysis_years || 25} years.`,
          `天台 ${inputs.width} × ${inputs.depth} 米；${Math.max(...inputs.horizon) > 0 ? "已計入鄰屋遮擋" : "尚未輸入鄰屋遮擋"}；${inputs.budget ? "預算 " + money(inputs.budget) : "沒有設定預算上限"}；報價每 kW ${money(inputs.price_per_kw)}＋固定費 ${money(inputs.fixed_cost)}；比較 ${inputs.analysis_years || 25} 年收支。`,
        )}
      </p>
      {pending && (
        <p className="brief-note">
          {t(
            "These are your last confirmed inputs. Apply your draft to update this advice.",
            "這裡總結上一次確認的資料；按「確認並保留」後才更新建議。",
          )}
        </p>
      )}
      <label className="select-field">
        {t("What matters most to you?", "你最想優先做到甚麼？")}
        <select
          aria-label={t("Recommendation priority", "建議優先目標")}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          {goals.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <p role="status">
          {t("Comparing the confirmed conditions…", "正在按已確認的條件比較…")}
        </p>
      ) : !plan ? (
        <div>
          <strong>
            {t(
              "No plan meets all your current requirements.",
              "目前沒有方案同時符合你的要求。",
            )}
          </strong>
          <p>
            {t(
              "Check the roof and access space, budget, installation quote and payback deadline. The counts below indicate rejected candidates; relaxing a goal may help, but is not guaranteed to.",
              "先檢查天台與維修空間、預算、安裝報價及回本期限。下方列出候選方案未通過的原因；放寬條件可能有幫助，但不保證一定可行。",
            )}
          </p>
          <ul>
            {Object.entries(search?.rejection_counts || {})
              .filter(([, n]) => n > 0)
              .map(([k, n]) => (
                <li key={k}>
                  {
                    {
                      budget: t("Over budget", "超出預算"),
                      profit: t(
                        "Insufficient financial return",
                        "收益未達要求",
                      ),
                      payback: t(
                        "Payback too late or not reached",
                        "回本太遲或未回本",
                      ),
                      minimum_capacity: t(
                        "System below minimum size",
                        "系統規模太小",
                      ),
                      energy_target: t(
                        "Below electricity target",
                        "年度發電未達你的目標",
                      ),
                    }[k]
                  }
                  ：{n}
                </li>
              ))}
          </ul>
        </div>
      ) : (
        <>
          {inputs.monthly_demand_kwh > 0 && (
            <p className="brief-energy">
              {t(
                `Your target: ${fmt(inputs.monthly_demand_kwh * 12 * inputs.demand_coverage)} kWh/year. This plan generates the equivalent of ${fmt((plan.annual_kwh / (inputs.monthly_demand_kwh * 12)) * 100)}% of your annual electricity use. This is an annual quantity comparison, not continuous supply or additional bill savings in the FiT calculation.`,
                `你的目標：每年 ${fmt(inputs.monthly_demand_kwh * 12 * inputs.demand_coverage)} 度電。此方案發電量相當於全年用電的 ${fmt((plan.annual_kwh / (inputs.monthly_demand_kwh * 12)) * 100)}%。這只是全年總量比較，不代表隨時供電，亦不在賣電收益之外重複計入省電費。`,
              )}
            </p>
          )}
          <div className="brief-solution">
            <strong>
              {t(
                `${plan.panels_count} panels · ${plan.actual_rows} rows`,
                `${plan.panels_count} 塊面板 · ${plan.actual_rows} 排`,
              )}
            </strong>
            <span>
              {t(
                `Face ${plan.config.azimuth}° clockwise from north; tilt ${plan.config.tilt}°`,
                `朝向 ${plan.config.azimuth}°（從北順時針）；傾斜 ${plan.config.tilt}°`,
              )}
              {plan.config.azimuth === 180 ? " · " + t("south", "即正南") : ""}
            </span>
          </div>
          <p>
            {t(
              `About ${fmt(plan.annual_kwh)} kWh each year; installation ${money(plan.initial_cost)}; sustained cost recovery ${plan.reason_details.stable_payback?.slice(0, 7) || "not reached"}.`,
              `每年估計發 ${fmt(plan.annual_kwh)} 度電；安裝費 ${money(plan.initial_cost)}；所選年限內，估計從 ${plan.reason_details.stable_payback?.slice(0, 7) || "未達成"} 起收回成本且之後不再倒退。`,
            )}
          </p>
          <p>
            {
              {
                npv: t(
                  "This is the highest discounted return among searched plans meeting your constraints. It may need more money up front than a smaller system.",
                  "在搜尋到且符合要求的方案中，它考慮收錢早晚後的淨收益最高；代價可能是先投入更多錢。",
                ),
                payback: t(
                  "This recovers the initial spending soonest without going negative again inside the chosen period. It may generate less electricity or earn less overall.",
                  "在符合要求的候選方案中，它較早收回成本，且在所選年限內不再變負；代價可能是發電較少或總收益較低。",
                ),
                economy: t(
                  "This has the lowest initial cost among eligible searched plans. Saving money now may mean less electricity later.",
                  "在符合要求的候選方案中，它的安裝費最低；現在少花錢，往後也可能少發電。",
                ),
                generation: t(
                  "This produces the most energy among eligible searched plans. More electricity does not necessarily mean faster payback.",
                  "在符合要求的候選方案中，它發電最多；多發電不一定代表更快回本。",
                ),
              }[priority]
            }
          </p>
          <button onClick={() => onChoose(plan.config)}>
            {t("Put this plan in my draft", "把這個建議填入草稿")}
          </button>
        </>
      )}
      <small>
        {t(
          "Best among searched options under your assumptions, not a proven global optimum. No user interview or real rooftop measurement is implied.",
          "這是依你的假設，在已搜尋方案中的建議，不是證明過的全局最優解，也不代表已完成用戶訪談或實地測量。",
        )}
      </small>
    </section>
  );
}
