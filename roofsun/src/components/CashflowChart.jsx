import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { fmt, money } from "../lib/format.js";
import { niceTicks } from "../lib/chartTicks.js";
const timestamp = (date) => Date.parse(`${date}T00:00:00Z`);
function CashflowChart({ result, inputs, settings, selected, t }) {
  const data = result.cashflow.map((p) => ({ ...p, time: timestamp(p.date) }));
  const ticks = niceTicks(data.flatMap((p) => [p.A, p.B])),
    s = selected ? "B" : "A",
    other = selected ? "A" : "B";
  const first = data[0],
    last = data.at(-1),
    cutoff = settings.policy.fit_end;
  const years = [];
  for (
    let year = Number(first.date.slice(0, 4)) + 1;
    year <= Number(last.date.slice(0, 4));
    year++
  ) {
    const tick = timestamp(`${year}-01-01`);
    if (tick >= first.time && tick <= last.time) years.push(tick);
  }
  const payback = data.find((p) => p.date === result[`stable_payback_${s}`]);
  const fitPoint = data.find((p) => p.date === cutoff);
  const anniversaryYear = Number(inputs.commissioning.slice(0, 4)) + 10;
  const replacement = data.find((p) =>
    p.date.startsWith(`${anniversaryYear}${inputs.commissioning.slice(4, 7)}`),
  );
  const scenario = (key) =>
    key === "A"
      ? t("A · Stop after FiT", "A · 上網電價後停用")
      : t("B · Continue self-use", "B · 繼續自用");
  return (
    <section
      className="cashflow-card"
      data-testid="cashflow-chart"
      data-selected={s}
      data-points={data.length}
      data-initial={first[s]}
      data-final-a={last.A}
      data-final-b={last.B}
      data-payback={payback?.date || ""}
    >
      <h3>{t("When does the investment come back?", "幾時收回這筆投資？")}</h3>
      <p className="help">
        {t("Simulated cumulative net cash (HK$)", "模擬累計淨現金 (HK$)")} ·{" "}
        {first.date.slice(0, 7)}–{last.date.slice(0, 7)}
      </p>
      <div className="cash-legend">
        <span className="solid-key">{scenario(s)}</span>
        <span className="dashed-key">{scenario(other)}</span>
      </div>
      <div
        className="chart-frame cash-frame"
        role="img"
        aria-label={t(
          "Monthly undiscounted cash flow over 25 years",
          "25 年逐月未折現現金流",
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 25, right: 15, bottom: 15, left: 5 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#dce4d6"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={[first.time, last.time]}
              ticks={[first.time, ...years]}
              tickFormatter={(n) => new Date(n).getUTCFullYear()}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              minTickGap={4}
            />
            <YAxis
              ticks={ticks}
              domain={[ticks[0], ticks.at(-1)]}
              allowDecimals={false}
              width={65}
              tickFormatter={(v) => v.toLocaleString("en-GB")}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              labelFormatter={(value) =>
                new Date(value).toISOString().slice(0, 7)
              }
              formatter={(v, key) => [money(v), scenario(key)]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <ReferenceLine y={0} stroke="#536752" strokeWidth={1.5} />
            <ReferenceLine
              x={timestamp(cutoff)}
              stroke="#bd8841"
              strokeDasharray="4 3"
              label={{
                value: t("FiT ends", "上網電價結束"),
                position: "insideTopRight",
                fontSize: 11,
                fill: "#805720",
              }}
            />
            <Line
              dataKey={other}
              stroke="#a6a99b"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey={s}
              stroke="#3d7052"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={first.time}
              y={first[s]}
              r={4}
              fill="#3d7052"
              stroke="#fff"
              label={{
                value: t("Installation", "安裝"),
                position: "right",
                fontSize: 11,
              }}
            />
            {payback && (
              <ReferenceDot
                x={payback.time}
                y={payback[s]}
                r={4}
                fill="#3d7052"
                stroke="#fff"
                label={{
                  value: t("Payback", "回本"),
                  position: "top",
                  fontSize: 11,
                }}
              />
            )}
            {fitPoint && (
              <ReferenceDot
                x={fitPoint.time}
                y={fitPoint[s]}
                r={4}
                fill="#bd8841"
                stroke="#fff"
              />
            )}
            {replacement && inputs.inverter_cost > 0 && (
              <ReferenceDot
                x={replacement.time}
                y={replacement.B}
                r={4}
                fill="#9e7665"
                stroke="#fff"
                label={{
                  value: t("B: inverter", "B：逆變器"),
                  position: "bottom",
                  fontSize: 11,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        {t(
          "Undiscounted; NPV is calculated separately.",
          "未折現；淨現值另計。",
        )}
      </p>
      <ul className="cash-milestones">
        <li>
          <strong>{first.date.slice(0, 7)}</strong> ·{" "}
          {t("Installation paid upfront", "一次付清安裝費")}: {money(first[s])}
        </li>
        <li>
          <strong>{payback?.date.slice(0, 7) || "—"}</strong> ·{" "}
          {payback
            ? t("Sustained payback", "持續回本")
            : t("No sustained payback within 25 years", "25 年內未持續回本")}
        </li>
        {fitPoint && (
          <li>
            <strong>{cutoff}</strong> · {t("FiT ends", "上網電價結束")}:{" "}
            {money(fitPoint[s])} ·{" "}
            {t(
              "A stays flat after shutdown; B continues self-use and costs.",
              "A 停用後持平；B 繼續自用及付運作費。",
            )}
          </li>
        )}
        {replacement && inputs.inverter_cost > 0 && (
          <li data-testid="inverter-milestone">
            <strong>{replacement.date.slice(0, 7)}</strong> ·{" "}
            {t(
              "B only: replace the inverter in year 10",
              "只計 B：第 10 年更換逆變器",
            )}
            : {money(inputs.inverter_cost * (1 + inputs.cost_inflation) ** 10)}{" "}
            {t(
              "replacement allowance, alongside that month’s income and maintenance.",
              "更換費假設，該月另計收入及維護費。",
            )}
          </li>
        )}
        <li>
          <strong>{last.date.slice(0, 7)}</strong> · A {money(last.A)} / B{" "}
          {money(last.B)}
        </li>
      </ul>
    </section>
  );
}

export default React.memo(CashflowChart);
