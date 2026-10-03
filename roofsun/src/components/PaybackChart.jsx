import React, { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApi } from "../lib/api.js";
import { annualBalances, elapsedMonths } from "../lib/payback.js";
import { groupChoices } from "./Choices.jsx";

export default function PaybackChart({
  inputs,
  config,
  result,
  suggestions,
  loading = false,
  pending = false,
  t,
  currency = "HKD",
}) {
  const [choice, setChoice] = useState("current");
  const groups = groupChoices(suggestions);
  const options = groups.map((g) => ({
    key: g.goals[0],
    config: g.result.config,
    panels: g.result.panels_count,
  }));
  const selected = options.find((o) => o.key === choice);
  const request = useApi(
    "/api/evaluate?payback-chart=1",
    { inputs, config: selected?.config || config },
    150,
    !!inputs && !!config && !loading && (!!selected || !result),
  );
  const data =
    selected || !result
      ? !request.loading && !request.error
        ? request.data
        : null
      : result;
  const scenario = inputs?.post_fit ? "B" : "A",
    rows = annualBalances(loading ? null : data, scenario);
  const money = (n) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  const first = data?.["payback_" + scenario],
    stable = data?.["stable_payback_" + scenario];
  const duration = (date) => {
    const months = elapsedMonths(inputs?.commissioning, date);
    if (months === null)
      return t("Not reached in this period", "所選年限內未回本");
    return t(
      `About ${Math.floor(months / 12)} years ${months % 12} months`,
      `約 ${Math.floor(months / 12)} 年 ${months % 12} 個月`,
    );
  };
  const labels = {
    npv: t("Best long-term value", "長期較划算方案"),
    payback: t("Faster payback", "較快回本方案"),
    under10: t("Best within 10 kW", "10 kW 以內方案"),
  };
  return (
    <section
      className="card annual-payback"
      aria-label={t("Year-by-year payback", "逐年回本圖")}
    >
      <div className="payback-heading">
        <div>
          <h2>
            {t(
              "How long until the panels pay for themselves?",
              "裝了這套太陽能，多久收回成本？",
            )}
          </h2>
          <p>
            {t(
              "Follow the account from the installation payment to each year-end balance.",
              "從付出安裝費開始，逐年看這筆投資還差多少回本，或已經賺回多少。",
            )}
          </p>
        </div>
        <label>
          {t("Which layout?", "查看哪個方案？")}
          <select
            aria-label={t("Payback chart layout", "回本圖方案")}
            value={selected ? choice : "current"}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="current">
              {t("Confirmed layout", "目前已確認的排布")}
            </option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {labels[o.key]} · {o.panels} {t("panels", "塊面板")}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pending && (
        <p className="payback-notice">
          {t(
            "You have unsaved changes. This chart still uses your confirmed inputs.",
            "你有尚未確認的修改。此圖仍使用上次確認的條件。",
          )}
        </p>
      )}
      {!rows.length ? (
        <p role="status">
          {request.error || t("Loading the account…", "正在整理收支…")}
        </p>
      ) : (
        <>
          <div className="payback-summary">
            <div>
              <span>{t("Installation payment", "初期安裝費")}</span>
              <strong>{money(data.initial_cost)}</strong>
            </div>
            <div>
              <span>{t("First recovered costs", "第一次收回成本")}</span>
              <strong>{duration(first)}</strong>
              <small>{first?.slice(0, 7) || "—"}</small>
            </div>
            <div>
              <span>
                {t(
                  "Stays recovered through the selected period",
                  "之後直到所選期末仍未再虧損",
                )}
              </span>
              <strong>{duration(stable)}</strong>
              <small>{stable?.slice(0, 7) || "—"}</small>
            </div>
          </div>
          <p>
            {t(
              "Below zero: costs are not yet recovered. At zero: costs and income balance. Above zero: money left after modelled costs.",
              "零線以下：還沒收回成本。碰到零線：收支持平。零線以上：扣除模型計入的費用後，剩下的錢。",
            )}
          </p>
          <p className="payback-scroll-hint">
            {t(
              "Swipe or scroll sideways to see every year →",
              "左右滑動圖表，查看後面的年份 →",
            )}
          </p>
          <div
            className="payback-scroll"
            tabIndex={0}
            aria-label={t(
              "Scroll horizontally to compare every year",
              "左右滑動，逐年比較",
            )}
          >
            <div
              style={{
                width: `${Math.max(680, rows.length * 70)}px`,
                height: 340,
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  margin={{ top: 28, right: 24, left: 20, bottom: 12 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 4" />
                  <XAxis
                    dataKey="year"
                    interval={0}
                    tick={{ fontSize: 14 }}
                    tickFormatter={(v) =>
                      v === 0 ? t("Start", "安裝時") : t(`Y${v}`, `第${v}年`)
                    }
                  />
                  <YAxis
                    width={80}
                    tick={{ fontSize: 14 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    labelFormatter={(v) =>
                      v === 0
                        ? t("Installation payment", "付安裝費時")
                        : t(`End of operating year ${v}`, `使用滿 ${v} 年`)
                    }
                    formatter={(v) => [
                      money(v),
                      t("Cumulative money after costs", "累計收支相抵後的餘額"),
                    ]}
                    contentStyle={{ fontSize: 16, borderRadius: 12 }}
                  />
                  <ReferenceLine y={0} stroke="#243f48" strokeWidth={2} />
                  <Bar
                    dataKey="balance"
                    isAnimationActive={false}
                    maxBarSize={38}
                  >
                    {rows.map((r) => (
                      <Cell
                        key={r.year}
                        fill={r.balance < 0 ? "#b16b3d" : "#287b71"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="payback-legend">
            {t(
              "Brown: still recovering costs · Green: costs recovered · Currency: ",
              "棕色：尚未回本 · 綠色：已收回成本 · 貨幣：",
            )}
            {currency}
          </p>
          <p className="microcopy">
            {t(
              "Bars show cumulative cash, not yearly income or discounted present value. Monthly calculations determine payback; maintenance and any year-10 replacement can pull the balance down again. Future years repeat the chosen reference weather with modelled degradation.",
              "柱狀圖顯示累計收支，不是每年收入，也不是折算後的淨現值。回本月份按逐月記錄判斷；維護和第十年更換費可能令餘額再次下降。未來年份重複參考年天氣，並計入模型衰減。",
            )}
          </p>
          <details>
            <summary>
              {t("See exact yearly amounts", "查看每年的具體金額")}
            </summary>
            <div className="payback-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Year", "年份")}</th>
                    <th>{t("As of", "截至日期")}</th>
                    <th>{t("Balance after costs", "累計收支餘額")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.year}>
                      <td>
                        {r.year === 0 ? t("Installation", "安裝時") : r.year}
                      </td>
                      <td>{r.date}</td>
                      <td>{money(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
