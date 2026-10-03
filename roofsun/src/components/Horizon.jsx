import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { NumberField } from "./Controls.jsx";
export default function Horizon({ values, onChange, t }) {
  const [expanded, setExpanded] = useState(false),
    [direction, setDirection] = useState(180),
    [angle, setAngle] = useState(30);
  return (
    <div className="horizon-control">
      <div className="section-label">
        {t("SURROUNDING SHADE", "周圍遮擋")}
        <button
          className="text-button"
          onClick={() => onChange(Array(12).fill(0))}
        >
          {t("Clear", "清除")}
        </button>
      </div>
      <svg
        viewBox="0 0 270 65"
        className="skyline"
        role="img"
        aria-label={t("Horizon angles", "天際線仰角")}
      >
        <line x1="0" y1="49" x2="270" y2="49" stroke="#c5d1c2" />
        <path
          d={
            "M0,49 " +
            values
              .concat(values[0])
              .map((v, i) => `L${i * 22.5},${49 - v * 0.5}`)
              .join(" ") +
            " L270,49Z"
          }
          fill="#cbd8c2"
          stroke="#709066"
        />
        {["N", "E", "S", "W", "N"].map((v, i) => (
          <text
            key={i}
            x={i * 67.5}
            y="63"
            textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
            fontSize="9"
            fill="#74806d"
          >
            {v}
          </text>
        ))}
      </svg>
      <div className="shade-add">
        <select
          aria-label={t("Obstacle direction", "遮擋方向")}
          value={direction}
          onChange={(e) => setDirection(+e.target.value)}
        >
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((v) => (
            <option key={v} value={v}>
              {v}°{" "}
              {v === 180
                ? t("South", "南")
                : v === 90
                  ? t("East", "東")
                  : v === 270
                    ? t("West", "西")
                    : v === 0
                      ? t("North", "北")
                      : ""}
            </option>
          ))}
        </select>
        <input
          aria-label={t("Obstacle elevation", "遮擋仰角")}
          type="number"
          min="0"
          max="80"
          value={angle}
          onChange={(e) => setAngle(Math.min(80, Math.max(0, +e.target.value)))}
        />
        <button
          onClick={() => {
            const next = [...values];
            next[direction / 30] = angle;
            onChange(next);
          }}
        >
          {t("Set", "設定")}
        </button>
      </div>
      <button
        className="text-button advanced-button"
        onClick={() => setExpanded(!expanded)}
      >
        {t("12-direction measurements", "十二方位量度")}
        <ChevronDown size={13} />
      </button>
      <details className="measurement-help">
        <summary>{t("How to measure shade", "如何量度遮擋")}</summary>
        <p>
          {t(
            "From the proposed module position, use a compass to find each of 12 directions and a phone inclinometer to measure the highest obstacle above the horizon. 0° means an unobstructed horizon. Approximate angle = atan((obstacle top height − panel height) / horizontal distance). Repeat at different roof positions if nearby objects vary; a single horizon cannot represent all near objects.",
            "在預定面板位置，用指南針找出十二個方位，再用手機傾角工具量度最高障礙物仰角。0° 表示沒有遮擋。近似角度 = atan((物件頂部高度 − 面板高度)／水平距離)。近距離物件會因位置改變，應在天台不同位置重複量度；單一天際線不能代表全部近物件。",
          )}
        </p>
        <p>
          {t(
            "Measure roof dimensions and building covered area separately. Include access/maintenance zones as exclusion rectangles. The presets are illustrative, not surveyed properties.",
            "分別量度可用天台尺寸及屋宇有蓋面積。可用預留矩形標示通道／維修區。預設情景為示例，並非已勘測物業。",
          )}
        </p>
      </details>
      {expanded && (
        <div className="horizon-grid">
          {values.map((v, i) => (
            <NumberField
              key={i}
              label={`${i * 30}°`}
              value={v}
              max={80}
              onChange={(n) =>
                onChange(values.map((old, j) => (j === i ? n : old)))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
