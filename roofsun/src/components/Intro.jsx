import React, { useState } from "react";
import { Home, SunMedium, BadgeCheck } from "lucide-react";
import { OWNER_DEFAULTS } from "./Screening.jsx";

export const EXAMPLES = [
  { id: "open", en: "Open rooftop", zh: "開闊天台", inputs: OWNER_DEFAULTS },
  {
    id: "south",
    en: "Tall southern neighbour",
    zh: "南面有高樓",
    inputs: {
      ...OWNER_DEFAULTS,
      neighbours: [{ direction: 180, floors: 3, distance: 3 }],
    },
  },
  {
    id: "alley",
    en: "Neighbours on both sides",
    zh: "兩邊夾巷",
    inputs: {
      ...OWNER_DEFAULTS,
      neighbours: [
        { direction: 90, floors: 2, distance: 4 },
        { direction: 270, floors: 2, distance: 4 },
      ],
    },
  },
];
export function jumpTo(id, focus = false) {
  const node = document.getElementById(id);
  if (!node) return;
  if (id === "trust") {
    const detail = node.querySelector(".assumptions-panel");
    if (detail) detail.open = true;
  }
  node.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  if (focus) node.querySelector("input")?.focus({ preventScroll: true });
}
export default function Intro({ t, onExample }) {
  const [examples, setExamples] = useState(false);
  return (
    <>
      <section id="intro" className="intro-section">
        <div className="intro-copy">
          <span className="eyebrow">
            {t(
              "HacKU 2026 · Rooftop solar screening for Hong Kong village houses",
              "HacKU 2026 · 香港村屋天台太陽能試算",
            )}
          </span>
          <h1>
            {t(
              "Test your roof before you buy the panels.",
              "裝板之前，先試一次。",
            )}
          </h1>
          <p className="intro-description">
            {t(
              "Answer 7 questions about your home. We simulate a full year of hourly sunlight, neighbour shading and feed-in tariff income, then tell you whether it is worth it, when it pays back, and the highest quote you should accept.",
              "回答 7 條關於屋企的問題，我們用一整年的逐小時天氣，模擬你天台的日照、鄰屋遮擋和上網電價收入，告訴你：值不值得裝、幾時回本、報價最高可以接受多少。",
            )}
          </p>
          <div className="intro-actions">
            <button
              className="primary-button"
              onClick={() => jumpTo("inputs", true)}
            >
              {t("Check my roof →", "開始填寫我的天台 →")}
            </button>
            <button
              aria-expanded={examples}
              onClick={() => setExamples(!examples)}
            >
              {t("See an example", "先看示例結果")}
            </button>
            <button className="text-button" onClick={() => jumpTo("trust")}>
              {t("How the model works", "模型怎樣算？")}
            </button>
          </div>
          {examples && (
            <div className="example-chips">
              {EXAMPLES.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    onExample(structuredClone(e.inputs));
                    jumpTo("results");
                  }}
                >
                  {t(e.en, e.zh)}
                </button>
              ))}
            </div>
          )}
          <p className="intro-trust">
            {t(
              "Hourly simulation for a full year · HKO annual radiation adjustment · Assumed FiT HK$4/kWh up to 10 kW, until end-2033",
              "逐小時模擬一整年 · 天文台年度輻照校準 · 模型上網電價：不超過 10 kW 為 HK$4／度，計至 2033 年底",
            )}
          </p>
          <a
            className="intro-down"
            href="#inputs"
            onClick={(e) => {
              e.preventDefault();
              jumpTo("inputs", true);
            }}
          >
            {t("↓ Scroll down or start now", "↓ 向下或直接開始")}
          </a>
        </div>
        <svg
          className="intro-art"
          viewBox="0 0 480 410"
          role="img"
          aria-label={t(
            "Illustration of solar panels on a village house",
            "村屋天台太陽能板插畫",
          )}
        >
          <ellipse cx="241" cy="355" rx="200" ry="27" fill="#e1e8d8" />
          <path
            d="M50 180 Q150 -40 395 105"
            fill="none"
            stroke="#d6b875"
            strokeWidth="2"
            strokeDasharray="5 8"
          />
          <g className="intro-sun">
            <circle cx="240" cy="44" r="23" fill="#e0a43a" />
            <circle
              cx="240"
              cy="44"
              r="35"
              fill="none"
              stroke="#e0a43a"
              opacity=".25"
            />
          </g>
          <path d="M51 222 126 203 126 335 51 355Z" fill="#b8cbb8" />
          <path d="M126 203 177 227 177 354 126 335Z" fill="#91aa97" />
          <path d="M177 155 313 117 313 322 177 361Z" fill="#e3e9d7" />
          <path d="M313 117 416 165 416 367 313 322Z" fill="#b0c7b6" />
          <path
            d="M172 154 310 112 421 163 283 205Z"
            fill="#f0f1df"
            stroke="#6f907c"
            strokeWidth="4"
          />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(0 ${i * 53})`}>
              <path
                d="M198 215 231 205 231 234 198 244Z M257 198 287 189 287 218 257 227Z"
                fill="#739b95"
              />
              <path
                d="M335 202 365 216 365 245 335 231Z M382 224 403 234 403 263 382 253Z"
                fill="#598581"
              />
            </g>
          ))}
          {[0, 1].map((i) => (
            <g key={i} transform={`translate(${i * 30} ${i * 24})`}>
              <path
                d="M191 133 294 103 339 125 236 155Z"
                fill="#254f38"
                stroke="#d3dfc8"
                strokeWidth="2"
              />
              <path
                d="M214 127 259 148 M241 120 285 141 M267 112 312 133 M202 144 305 114"
                stroke="#7cafa4"
                strokeWidth="1.5"
              />
              <path
                className="panel-shine"
                d="M191 133 294 103 315 113 212 143Z"
                fill="#fff2c2"
                opacity=".16"
              />
            </g>
          ))}
          <path
            d="M64 239 87 233 87 257 64 263Z M98 230 117 225 117 249 98 254Z"
            fill="#759a8a"
          />
        </svg>
      </section>
      <section
        className="how-it-works"
        aria-label={t("How it works", "怎樣運作")}
      >
        {[
          [
            Home,
            "Answer 7 questions",
            "回答 7 條問題",
            "Roof size, door direction, nearby buildings and quote: start with what you know; verify any estimates.",
            "天台尺寸、正門方向、四周鄰屋、報價……先填你知道的資料，估計值仍需核對。",
          ],
          [
            SunMedium,
            "Simulate a full year",
            "模擬一整年",
            "Calculate hourly sun position and shading, with annual radiation adjusted against HKO observations.",
            "逐小時計算太陽位置、前後排及鄰屋遮擋，並按天文台年度輻照資料校準。",
          ],
          [
            BadgeCheck,
            "Read the conclusion",
            "看結論",
            "Worthwhile, marginal or not recommended; payback, quote ceiling and the sources behind the assumptions.",
            "值得裝／勉強／不建議、回本時間、最高可接受報價，以及假設的來源。",
          ],
        ].map(([Icon, en, zh, desc, cn], i) => (
          <article key={en}>
            <Icon size={24} />
            <span>0{i + 1}</span>
            <h3>{t(en, zh)}</h3>
            <p>{t(desc, cn)}</p>
          </article>
        ))}
      </section>
      <p className="intro-disclaimer">
        {t(
          "This is not an engineering design or quote. We do not sell panels; we help you check the numbers before contacting an installer.",
          "這不是工程設計或報價。我們不賣板，只幫你在聯絡安裝商之前先算清楚。",
        )}
      </p>
    </>
  );
}
