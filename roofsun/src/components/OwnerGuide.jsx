import React, { useState } from "react";
import { money, fmt } from "../lib/format.js";

export default function OwnerGuide({
  inputs,
  result,
  t,
  onEvidence,
  onCompare,
}) {
  const [question, setQuestion] = useState("return");
  const key = inputs.post_fit ? "B" : "A";
  const years = result?.[`payback_years_${key}`];
  const stress = result?.[`max_acceptable_quote_stress_${key}`];
  const items = [
    ["return", t("When could I recover the cost?", "何時才能收回投入？")],
    ["space", t("What do extra panels cost me?", "多裝幾塊，要付出甚麼？")],
    [
      "confidence",
      t("What if the forecast is optimistic?", "如果發電沒有預期那麼多？"),
    ],
  ];
  return (
    <section
      className="owner-guide card"
      aria-label={t("Before agreeing an installation", "確認安裝前先看懂")}
    >
      <span className="eyebrow">
        {t("UNDERSTAND BEFORE YOU COMMIT", "投入之前，先理解選擇")}
      </span>
      <h2>
        {t(
          "Does this rooftop plan fit what you need?",
          "這個天台方案，符合你的要求嗎？",
        )}
      </h2>
      <p>
        {t(
          "Explore the generation, space and payback behind an installation proposal. Bring the comparison to your installer to agree the details.",
          "先了解安裝方案的發電量、佔用空間及回本條件，再帶著比較結果與安裝師傅確認細節。",
        )}
      </p>
      <div
        className="owner-questions"
        role="group"
        aria-label={t("Choose your question", "選擇你關心的問題")}
      >
        {items.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={question === id}
            onClick={() => setQuestion(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="owner-answer" aria-live="polite">
        {!result ? (
          <p>
            {t(
              "Update the roof inputs to see an explanation of the current calculation.",
              "更新天台輸入後，這裡會解釋目前的計算結果。",
            )}
          </p>
        ) : question === "return" ? (
          <>
            <strong>
              {t("Installation estimate", "安裝費估算")}{" "}
              {money(result.initial_cost)} ·{" "}
              {t("Sustained payback", "持續回本")}{" "}
              {years == null
                ? t("not reached / not applicable", "未達成／不適用")
                : t(`about ${fmt(years, 1)} years`, `約 ${fmt(years, 1)} 年`)}
            </strong>
            <p>
              {t(
                "First break-even is when cumulative income first covers spending. Sustained payback also checks that later maintenance and the modeled replacement do not push the balance negative again. NPV discounts future money into today's value.",
                "首次回本是累計收入第一次補回支出；持續回本還會檢查後續維護和模型中的更換費用，是否令結餘再次變負。淨現值（NPV）則把未來的錢折算成今天的價值。",
              )}
            </p>
            <p>
              {t(
                "The answer depends on your quote, commissioning date and selected income assumptions. It is not a promised payment date.",
                "答案取決於報價、投產日期及所選收入假設，不是承諾的回款日期。",
              )}
            </p>
          </>
        ) : question === "space" ? (
          <>
            <strong>
              {t(
                `${result.panels_count} modules · ${fmt(result.capacity_kw, 2)} kW · ${fmt(result.annual_kwh)} kWh/year`,
                `${result.panels_count} 塊面板 · ${fmt(result.capacity_kw, 2)} kW · 每年 ${fmt(result.annual_kwh)} kWh`,
              )}
            </strong>
            <p>
              {t(
                "Compare two layouts on the same roof and weather. More modules cost more and occupy space; mutual shade can reduce generation per installed kW. Crossing the 10 kW tier can also change the whole system's FiT rate.",
                "在相同天台與氣象下比較兩種排布。更多面板需要更多投資與空間；相互遮擋可能降低每千瓦產出，跨過 10 kW 門檻也可能改變整套系統的上網電價。",
              )}
            </p>
            <button className="text-button" type="button" onClick={onCompare}>
              {t("Compare layouts and reasons →", "比較排布與選擇理由 →")}
            </button>
          </>
        ) : (
          <>
            <strong>
              {stress == null
                ? t(
                    "A stress comparison is not available for this layout.",
                    "這個排布暫無可用的壓力測試結果。",
                  )
                : t(
                    `At 15% less generation, the NPV=0 quote ceiling is ${money(stress)}.`,
                    `若發電少 15%，NPV＝0 的報價上限為 ${money(stress)}。`,
                  )}
            </strong>
            {stress != null && result.panels_count > 0 && (
              <p>
                {result.initial_cost > stress
                  ? t(
                      "Your installation estimate exceeds that ceiling: this stress scenario has negative NPV, even if the baseline passes.",
                      "目前安裝費估算高於這個上限：即使基準情景通過，這個壓力情景的淨現值仍為負。",
                    )
                  : t(
                      "Your estimate is at or below this ceiling. Budget and sustained-payback requirements still need separate checks.",
                      "目前估算不高於此上限；仍需另外檢查預算和持續回本目標。",
                    )}
              </p>
            )}
            <p>
              {t(
                "15% is an explicit stress assumption, not an error bar or a probability. Compare historical weather and input sensitivity before choosing.",
                "15% 是明示的壓力假設，不是誤差保證或發生機率。選擇前應再比較歷史氣象與輸入敏感性。",
              )}
            </p>
            <button className="text-button" type="button" onClick={onEvidence}>
              {t("See what the evidence supports →", "查看數據能支持甚麼 →")}
            </button>
          </>
        )}
      </div>
      <details className="owner-discussion">
        <summary>
          {t("Questions to take to your installer", "帶去與安裝師傅確認的問題")}
        </summary>
        <ul>
          <li>
            {t(
              "Which exact module, inverter and mounting design does this proposal use?",
              "方案採用哪款面板、逆變器及支架設計？",
            )}
          </li>
          <li>
            {t(
              "Does the all-in quote include access, fixing, electrical work and ongoing maintenance?",
              "總報價包含施工出入、固定、電力工程及後續維護嗎？",
            )}
          </li>
          <li>
            {t(
              "What shading survey and generation assumptions support the payback estimate?",
              "回本估算用了甚麼遮擋勘察和發電假設？",
            )}
          </li>
          <li>
            {t(
              "When can commissioning finish, and what changes if it is delayed?",
              "何時能完成投產？延後會怎樣影響收入？",
            )}
          </li>
        </ul>
        <p className="microcopy">
          {t(
            "You can explore with sample inputs. Actual quotations and surveys improve a property-specific decision; they are not required to try this simulation.",
            "可以先用示例輸入探索。實際報價與勘察能改善個別物業的判斷，但不是試用模擬器的前提。",
          )}
        </p>
      </details>
    </section>
  );
}
