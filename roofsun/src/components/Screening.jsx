import React from "react";
import { NumberField } from "./Controls.jsx";

export const COST_BANDS = {
  low: { fixed_cost: 2000, annual_om: 0, inverter_cost: 4000 },
  medium: { fixed_cost: 5000, annual_om: 300, inverter_cost: 5000 },
  high: { fixed_cost: 10000, annual_om: 1000, inverter_cost: 10000 },
};
export const OWNER_DEFAULTS = {
  roof: { width: 8.06, depth: 8.06 },
  door_direction: 0,
  neighbour: { floors: 0, distance: 10 },
  price_per_kw: 25000,
  cost_band: "medium",
  commissioning_month: "2027-01",
  post_fit: false,
};
// Preserved conversion from the earlier Screening.jsx: a constant-height facade.
export function neighbourHorizon(floors, distance) {
  return Array.from({ length: 12 }, (_, i) => {
    const delta = Math.abs(((i * 30 - 180 + 540) % 360) - 180);
    return delta <= 60
      ? Math.round(
          Math.min(
            80,
            (Math.atan2(
              floors * 3 * Math.cos((delta * Math.PI) / 180),
              distance,
            ) *
              180) /
              Math.PI,
          ) * 10,
        ) / 10
      : 0;
  });
}
const directions = [
  ["N", "北"],
  ["NE", "東北"],
  ["E", "東"],
  ["SE", "東南"],
  ["S", "南"],
  ["SW", "西南"],
  ["W", "西"],
  ["NW", "西北"],
];
const bands = [
  ["low", "Low", "低"],
  ["medium", "Medium", "中"],
  ["high", "High", "高"],
];
function Group({ number, title, children }) {
  return (
    <fieldset data-input-group={number}>
      <legend>
        <span className="step-number">{number}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
export default function OwnerInputs({ inputs, onChange, t }) {
  const set = (key, value) => onChange({ ...inputs, [key]: value });
  const costs = COST_BANDS[inputs.cost_band];
  return (
    <form
      className="owner-inputs"
      aria-label={t("Seven household inputs", "七項家常輸入")}
      onSubmit={(e) => e.preventDefault()}
    >
      <Group
        number={1}
        title={t(
          "How long and wide is the clear roof area?",
          "天台可以放板的地方，長幾米、闊幾米？",
        )}
      >
        <div className="field-pair">
          <NumberField
            label={t("Roof length", "天台長度")}
            value={inputs.roof.depth}
            min={1}
            max={30}
            step={0.1}
            unit="m"
            onChange={(v) => set("roof", { ...inputs.roof, depth: v })}
          />
          <NumberField
            label={t("Roof width", "天台闊度")}
            value={inputs.roof.width}
            min={1}
            max={30}
            step={0.1}
            unit="m"
            onChange={(v) => set("roof", { ...inputs.roof, width: v })}
          />
        </div>
        <p className="help">
          {t(
            "Measure one clear rectangle, excluding the stairhood and water tank.",
            "量度已扣除樓梯屋及水箱的一塊長方形空間。",
          )}
        </p>
      </Group>
      <Group
        number={2}
        title={t(
          "Which way does your front door face?",
          "你屋企正門朝哪個方向？",
        )}
      >
        <div className="direction-grid">
          {directions.map(([en, zh], i) => (
            <button
              type="button"
              key={en}
              aria-label={t(`Door direction ${en}`, `正門方向${zh}`)}
              aria-pressed={inputs.door_direction === i * 45}
              onClick={() => set("door_direction", i * 45)}
            >
              {t(en, zh)}
            </button>
          ))}
        </div>
      </Group>
      <Group
        number={3}
        title={t(
          "How much higher is the nearest southern neighbour?",
          "南面最近的鄰屋比天台高幾層？相距幾米？",
        )}
      >
        <div className="field-pair">
          <NumberField
            label={t("Floors above the roof", "高出天台的層數")}
            value={inputs.neighbour.floors}
            min={0}
            max={15}
            step={0.5}
            unit={t("floors", "層")}
            onChange={(v) =>
              set("neighbour", { ...inputs.neighbour, floors: v })
            }
          />
          <NumberField
            label={t("Distance to neighbour", "與鄰屋距離")}
            value={inputs.neighbour.distance}
            min={0.5}
            max={200}
            step={0.5}
            unit="m"
            onChange={(v) =>
              set("neighbour", { ...inputs.neighbour, distance: v })
            }
          />
        </div>
        <p className="help">
          {t(
            "No higher neighbour to the south? Enter 0 floors.",
            "南面沒有較高鄰屋，就填 0 層。",
          )}
        </p>
      </Group>
      <Group
        number={4}
        title={t(
          "What is the installer’s quote per kW?",
          "安裝商每千瓦報價多少？",
        )}
      >
        <NumberField
          label={t("Installation quote per kW", "每千瓦安裝報價")}
          value={inputs.price_per_kw}
          min={1}
          max={100000}
          step={500}
          unit="HK$"
          onChange={(v) => set("price_per_kw", v)}
        />
        <div className="button-group quote-buttons">
          {bands.map(([key, en, zh], i) => (
            <button
              type="button"
              key={key}
              aria-pressed={inputs.price_per_kw === [20000, 25000, 30000][i]}
              onClick={() => set("price_per_kw", [20000, 25000, 30000][i])}
            >
              {t(en, zh)} · {[20, 25, 30][i]}k
            </button>
          ))}
        </div>
        <p className="help">
          {t(
            "Installation total ÷ installed kW. The three reference prices are assumptions; use the actual quote and avoid counting setup costs twice.",
            "安裝總價 ÷ 千瓦數。三個參考價屬假設；請用實際報價，避免重複計固定費用。",
          )}
        </p>
      </Group>
      <Group
        number={5}
        title={t(
          "Which allowance for other costs?",
          "其他費用按低、中、高哪一檔？",
        )}
      >
        <div className="button-group">
          {bands.map(([key, en, zh]) => (
            <button
              type="button"
              key={key}
              aria-label={t(`${en} other costs`, `${zh}檔其他費用`)}
              aria-pressed={inputs.cost_band === key}
              onClick={() => set("cost_band", key)}
            >
              {t(en, zh)}
            </button>
          ))}
        </div>
        <p className="help">
          {t(
            `Assumed: HK$${costs.fixed_cost.toLocaleString()} setup, HK$${costs.annual_om.toLocaleString()}/year upkeep, HK$${costs.inverter_cost.toLocaleString()} inverter at year 10.`,
            `假設：固定費 HK$${costs.fixed_cost.toLocaleString()}、維護 HK$${costs.annual_om.toLocaleString()}/年、第 10 年更換逆變器 HK$${costs.inverter_cost.toLocaleString()}。`,
          )}
        </p>
      </Group>
      <Group
        number={6}
        title={t(
          "When do you expect installation to finish?",
          "預計幾時裝好？",
        )}
      >
        <label className="month-field">
          <span>{t("Completion month", "完工月份")}</span>
          <input
            aria-label={t("Completion month", "完工月份")}
            type="month"
            min="2026-01"
            max="2033-12"
            value={inputs.commissioning_month}
            onChange={(e) =>
              e.target.value && set("commissioning_month", e.target.value)
            }
          />
        </label>
      </Group>
      <Group
        number={7}
        title={t(
          "Will you use the electricity after 2033?",
          "2033 年上網電價結束後，發電會不會自己用？",
        )}
      >
        <label className="switch-field">
          <input
            type="checkbox"
            role="switch"
            aria-label={t("Self-use after 2033", "2033 年後自用")}
            checked={inputs.post_fit}
            onChange={(e) => set("post_fit", e.target.checked)}
          />
          <span>
            {inputs.post_fit
              ? t("Yes, include self-use", "會，計入自用")
              : t("No, use the conservative case", "不會，採保守情景")}
          </span>
        </label>
      </Group>
    </form>
  );
}
