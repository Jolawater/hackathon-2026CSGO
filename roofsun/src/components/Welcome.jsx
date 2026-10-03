import React, { useState } from "react";
import { NumericInput } from "./Controls.jsx";
import regions from "../../data/regions.json";

export default function Welcome({ t, onStart }) {
  const [active, setActive] = useState(false),
    [step, setStep] = useState(0);
  const [data, setData] = useState({
    region: "hong_kong",
    budget: 0,
    monthly_demand_kwh: 0,
    demand_coverage: 1,
    width: 8,
    depth: 6,
    price: "",
    date: "2027-01-01",
    max_payback_years: 7,
    example_quote: false,
    neighbour: "unknown",
  });
  const set = (key, value) => setData((d) => ({ ...d, [key]: value }));
  const headings = [
    t("Choose your location", "先選所在地"),
    t("Budget and electricity", "預算與用電需求"),
    t("Available rooftop space", "可用天台空間"),
    t("What blocks the sunshine?", "有甚麼遮住陽光？"),
    t("Quote and payback goal", "報價與回本目標"),
    t("Check before calculating", "核對後再開始"),
  ];
  const currency = regions[data.region].currency;
  const valid =
    step !== 4 ||
    ((data.example_quote ||
      (Number(data.price) > 0 && Number(data.price) <= 100000)) &&
      data.date >= "2026-01-01" &&
      data.date <= "2033-12-31");
  const number = (key, label, min, max, unit) => (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <NumericInput
          aria-label={label}
          value={data[key]}
          onChange={(v) => set(key, v)}
          min={min}
          max={max}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
  function finish() {
    onStart("personal", {
      ...data,
      price: data.example_quote
        ? data.region === "hong_kong"
          ? 25000
          : data.region === "shenzhen"
            ? 4000
            : 1500
        : Number(data.price),
    });
  }
  return (
    <main className="welcome workbench">
      <span className="eyebrow">ROOFSUN / YOUR ROOF, EXPLAINED</span>
      <h1>
        {t(
          "Before buying panels, try your roof.",
          "先在天台上試一試，再決定買不買。",
        )}
      </h1>
      {!active ? (
        <>
          <p>
            {t(
              "Start with what matters: your budget, your electricity needs and the space you have. We will ask one group of questions at a time.",
              "先從你關心的事開始：预算、用電量和天台空間。每一步只問一組相關問題，不用一次填完一大張表。",
            )}
          </p>
          <div className="welcome-paths">
            <button
              aria-label={t("Use my rooftop", "分析我的天台")}
              onClick={() => setActive(true)}
            >
              <strong>{t("Use my rooftop", "分析我的天台")}</strong>
              <small>
                {t(
                  "A guided, six-step setup",
                  "分六步填寫，有需要隨時返回修改",
                )}
              </small>
            </button>
            <button
              aria-label={t("Try an example first", "先玩一個示例")}
              onClick={() => onStart("demo")}
            >
              <strong>{t("Try an example first", "先玩一個示例")}</strong>
              <small>
                {t(
                  "Hong Kong example, with assumptions clearly labelled",
                  "香港示例，清楚標示假設",
                )}
              </small>
            </button>
          </div>
        </>
      ) : (
        <section className="welcome-form card">
          <nav
            className="setup-progress"
            aria-label={t("Setup progress", "填寫進度")}
          >
            {headings.map((name, i) => (
              <button
                key={name}
                disabled={i > step}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                {i + 1}
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <h2>
            {step + 1}. {headings[step]}
          </h2>
          {step === 0 && (
            <>
              <label className="select-field">
                {t("City", "城市")}
                <select
                  aria-label={t("City", "城市")}
                  value={data.region}
                  onChange={(e) => set("region", e.target.value)}
                >
                  {Object.entries(regions).map(([id, r]) => (
                    <option key={id} value={id}>
                      {t(r.en, r.zh)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {t(
                  "Each city uses its own reference weather and currency. Outside Hong Kong, enter electricity prices from your own contract; we do not assume a universal tariff.",
                  "每個城市使用自己的參考天氣和貨幣。深圳與倫敦需要填寫自己的購電／售電合約價格，不假設人人適用同一個電價。",
                )}
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <div className="field-pair">
                {number(
                  "budget",
                  t("Installation budget", "最多願意花多少安裝費？"),
                  0,
                  10000000,
                  currency,
                )}
                {number(
                  "monthly_demand_kwh",
                  t("Monthly electricity use", "電費單上每月用多少度電？"),
                  0,
                  100000,
                  t("kWh", "度"),
                )}
              </div>
              <p>
                {t(
                  "Use the electricity quantity, not your bill payment. Zero means unknown or no budget cap. We compare annual energy, not guaranteed electricity at every hour.",
                  "填電費單上的度數，不是繳费金額。填 0 表示用電未知／預算暫不限。比較的是年度電量，不保證每個時刻都有太陽能供電。",
                )}
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="field-pair">
                {number("width", t("Roof width", "天台左右寬度"), 2, 30, "m")}
                {number("depth", t("Roof length", "天台前後長度"), 2, 30, "m")}
              </div>
              <p>
                {t(
                  "Measure the usable rectangle, like measuring a room before placing furniture. Obstacles and detailed building measurements can be added later.",
                  "像買傢俬前量房間一樣，先量可用的長方形區域。天台物件及更詳細的屋宇資料可以之後補充。",
                )}
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <label className="select-field">
                {t("Taller neighbours", "附近有高於天台的樓宇嗎？")}
                <select
                  value={data.neighbour}
                  onChange={(e) => set("neighbour", e.target.value)}
                >
                  <option value="unknown">
                    {t("Not sure yet", "暫時不清楚")}
                  </option>
                  <option value="none">
                    {t("No obvious taller building", "沒有明顯更高的樓宇")}
                  </option>
                  <option value="yes">
                    {t("Yes — I will add dimensions later", "有，稍後補充尺寸")}
                  </option>
                </select>
              </label>
              <p>
                {t(
                  "We have not measured your neighbours. Until you add them, results assume no neighbour shading; this may overestimate generation. You can enter their size and position in professional parameters.",
                  "我們沒有量度你家的鄰樓。補充之前，計算暫按沒有鄰樓遮擋，可能高估發電量。可在「更專業的參數調整」填入鄰樓尺寸和位置。",
                )}
              </p>
            </>
          )}
          {step === 4 && (
            <>
              <label className="goal-checkbox">
                <input
                  type="checkbox"
                  checked={data.example_quote}
                  onChange={(e) => set("example_quote", e.target.checked)}
                />
                {t(
                  "No quote yet — use an explicitly assumed example",
                  "尚未取得報價，先用明確標示的示例",
                )}
              </label>
              {!data.example_quote &&
                number(
                  "price",
                  t("Quoted installation cost per kW", "每 kW 安裝報價"),
                  1,
                  100000,
                  currency,
                )}
              <div className="field-pair">
                {number(
                  "max_payback_years",
                  t("Hope to recover costs within", "希望多少年內收回成本"),
                  0,
                  25,
                  t("years", "年"),
                )}
                <label className="number-field">
                  <span>{t("Expected start date", "預計開始發電日期")}</span>
                  <input
                    type="date"
                    min="2026-01-01"
                    max="2033-12-31"
                    value={data.date}
                    onChange={(e) => set("date", e.target.value)}
                  />
                </label>
              </div>
              <p>
                {t(
                  "Any example quote is a scenario, not a current market price. Check maintenance and fixed costs before treating payback as your own estimate.",
                  "示例報價只是情景假設，不是當前市場價格。把回本當作自己的估算前，仍要核對固定費和維護費。",
                )}
              </p>
            </>
          )}
          {step === 5 && (
            <>
              <dl className="setup-summary">
                <dt>{t("Location", "地區")}</dt>
                <dd>{t(regions[data.region].en, regions[data.region].zh)}</dd>
                <dt>{t("Budget", "預算")}</dt>
                <dd>
                  {data.budget
                    ? `${currency} ${data.budget}`
                    : t("No cap", "暫不限")}
                </dd>
                <dt>{t("Monthly use", "每月用電")}</dt>
                <dd>{data.monthly_demand_kwh || t("Unknown", "未知")} kWh</dd>
                <dt>{t("Roof", "天台")}</dt>
                <dd>
                  {data.width} × {data.depth} m
                </dd>
                <dt>{t("Quote", "報價")}</dt>
                <dd>
                  {data.example_quote
                    ? t("Illustrative assumption", "使用示例假設")
                    : `${currency} ${data.price}/kW`}
                </dd>
              </dl>
              <p>
                {t(
                  "Still assumed: panel specification, roof orientation, neighbour shading, maintenance and usable building area. These remain editable. Start calculates a scenario based on this record.",
                  "仍待核對：面板規格、天台方向、鄰樓遮擋、維護費及屋宇可用面積。這些資料都可再調整；開始後計算的是基於本頁記錄的情景。",
                )}
              </p>
            </>
          )}
          <div className="setup-buttons">
            <button
              onClick={() => (step ? setStep(step - 1) : setActive(false))}
            >
              {t("Back", "上一步")}
            </button>
            <button
              disabled={!valid}
              onClick={() => (step < 5 ? setStep(step + 1) : finish())}
            >
              {step < 5
                ? t("Next", "下一步")
                : t("Confirm and view my options", "確認資料，查看方案")}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
