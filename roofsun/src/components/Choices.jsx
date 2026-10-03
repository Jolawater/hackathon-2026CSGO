import React from "react";
import { fmt, money } from "../lib/format.js";

export function groupChoices(suggestions, advanced = false) {
  const groups = new Map();
  for (const key of [
    "npv",
    "payback",
    "under10",
    ...(advanced ? ["economy", "balanced", "generation"] : []),
  ]) {
    const r = suggestions?.[key];
    if (!r) continue;
    const signature =
      r.layout_signature ||
      JSON.stringify([r.config, r.panels_count, r.annual_kwh]);
    if (groups.has(signature)) groups.get(signature).goals.push(key);
    else groups.set(signature, { result: r, goals: [key] });
  }
  return [...groups.values()];
}
export default function Choices({
  suggestions,
  advanced,
  loading,
  t,
  config,
  onChoose,
}) {
  const labels = {
    npv: t("Best long-term value", "長期算下來最划算"),
    payback: t("Recover spending sooner", "較快收回安裝費"),
    under10: t("Best within 10 kW", "10 kW 以內較划算"),
    economy: t("Spend less up front", "先少花一些錢"),
    balanced: t("Middle ground", "費用與發電折中"),
    generation: t("Generate more", "多發一些電"),
  };
  const groups = groupChoices(suggestions, advanced);
  if (loading)
    return <p role="status">{t("Comparing layouts…", "正在比較排布…")}</p>;
  if (!groups.length)
    return (
      <p>
        {t(
          "No layout meets all your goals. Try relaxing the budget or payback target.",
          "目前沒有方案同時符合所有要求，可以試著調整預算或回本期限。",
        )}
      </p>
    );
  return (
    <>
      <p className="choice-explanation">
        {t(
          `${groups.length} distinct recommended layouts. If one layout wins several goals, it appears once with all its badges.`,
          `${groups.length} 個不同的推薦排布。同一方案若同時勝出幾個目標，只顯示一次，並列出它的優點。`,
        )}
      </p>
      <div className="recommendation-grid">
        {groups.map(({ result: r, goals }, i) => {
          const active = Object.entries(r.config).every(
            ([k, v]) =>
              (config[k] ?? (k.startsWith("offset_") ? 0 : undefined)) === v,
          );
          return (
            <button
              key={i}
              className={`recommendation ${active ? "featured" : ""}`}
              aria-pressed={active}
              onClick={() => onChoose(r.config)}
            >
              <div className="choice-badges">
                {goals.map((g) => (
                  <span key={g}>{labels[g]}</span>
                ))}
              </div>
              <div className="recommendation-values">
                <strong>
                  {r.panels_count}
                  <small>{t(" panels", " 塊面板")}</small>
                </strong>
                <span>{money(r.initial_cost)}</span>
              </div>
              <p>
                {t(
                  `About ${fmt(r.annual_kwh)} kWh per year`,
                  `估計每年發 ${fmt(r.annual_kwh)} 度電`,
                )}
              </p>
              <p>
                {t("Cost recovered by", "估計收回成本時間")}{" "}
                {r.reason_details.stable_payback?.slice(0, 7) ||
                  t("not reached", "未達成")}
              </p>
              <p>
                {t("Value in today’s money", "換算成今天的錢，淨收益")}{" "}
                {money(r.reason_details.npv)}
              </p>
              <small>
                {t(
                  "Like comparing different package sizes: more panels can mean more electricity, but also more spending and roof space.",
                  "像選不同大小的套餐：多幾塊板可能多發電，也要多花錢、多佔天台。",
                )}
              </small>
              <p className="choice-action">
                {active
                  ? t("Current confirmed layout", "目前已確認的排布")
                  : t(
                      "Try this layout → then confirm",
                      "試用這個排布 → 再按確認",
                    )}
              </p>
            </button>
          );
        })}
      </div>
    </>
  );
}
