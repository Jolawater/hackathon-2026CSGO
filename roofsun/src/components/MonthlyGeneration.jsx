import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { fmt } from "../lib/format.js";
import { niceTicks } from "../lib/chartTicks.js";
export default function MonthlyGeneration({ result, t }) {
  const data = result.monthly_kwh.map((kwh, i) => ({
    month: i + 1,
    kwh,
    specific: kwh / result.capacity_kw,
  }));
  const values = data.map((d) => d.kwh),
    ticks = niceTicks(values);
  const min = values.indexOf(Math.min(...values)),
    max = values.indexOf(Math.max(...values));
  return (
    <div
      className="monthly-generation"
      data-testid="monthly-chart"
      data-monthly={JSON.stringify(values)}
    >
      <h4>{t("Generation through the year", "每個月，發幾多電？")}</h4>
      <p className="help">
        {t(
          "Simulated first year · current layout · kWh",
          "模擬首年 · 當前配置 · kWh",
        )}
      </p>
      <div
        className="chart-frame"
        role="img"
        aria-label={t(
          "Twelve months of simulated generation",
          "十二個月的模擬發電量",
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 25, right: 12, bottom: 10, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="#dce4d6"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              ticks={ticks}
              domain={[ticks[0], ticks.at(-1)]}
              allowDecimals={false}
              width={46}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <strong>
                      {payload[0].payload.month} {t("month", "月")}
                    </strong>
                    <span>{fmt(payload[0].payload.kwh)} kWh</span>
                    <span>{fmt(payload[0].payload.specific, 1)} kWh/kW</span>
                  </div>
                ) : null
              }
            />
            <Bar
              dataKey="kwh"
              fill="#527b60"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              <LabelList
                content={({ x, y, width, index, value }) =>
                  index === min || index === max ? (
                    <text
                      className="monthly-extreme"
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 8}
                      textAnchor="middle"
                      fill="#24422e"
                      fontSize="11"
                    >
                      {fmt(value)}
                    </text>
                  ) : null
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        {t(
          "February and March are cloudier and wetter, with lower generation; HKO observations also show a spring low. July to October are productive, while January can still do well in dry, clear winter weather.",
          "二至三月發電最少：春季多雲潮濕，天文台實測同樣是全年最低。七至十月最多：日照長、太陽高。一月雖是冬天，但天氣乾燥晴朗，發電不差。",
        )}
      </p>
    </div>
  );
}
