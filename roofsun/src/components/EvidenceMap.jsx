import React from "react";

const rows = [
  [
    "NASA POWER",
    "https://power.larc.nasa.gov/docs/services/api/temporal/hourly/",
    ["Bundled hourly weather, 2023–2025", "已接入 2023–2025 逐小時氣象"],
    [
      "Hourly sunlight and air temperature for the reference grid point.",
      "參考網格點的每小時日照及氣溫。",
    ],
    [
      "Not a measurement on your roof or a forecast of the next 25 years.",
      "不是你家天台的測量，也不是未來 25 年的天氣預報。",
    ],
  ],
  [
    "Hong Kong Observatory · 2025 Table 2b",
    "https://www.hko.gov.hk/en/wxinfo/pastwx/2025/ywx2025.htm",
    ["Independent radiation-input comparison", "獨立輻照輸入對照"],
    [
      "King's Park observations help check the order of magnitude of annual solar input.",
      "京士柏觀測可核對全年太陽能輸入的量級。",
    ],
    [
      "Different location and calendar boundaries; not a measured PV-output accuracy test.",
      "地點及曆年邊界不同，不能當作太陽能發電實測準確率。",
    ],
  ],
  [
    "Reda & Andreas · NREL/TP-560-34302",
    "https://docs.nlr.gov/docs/fy08osti/34302.pdf",
    ["Published solar-position benchmark", "公開太陽位置基準"],
    [
      "A reference case checks solar elevation and azimuth calculations.",
      "用參考案例核對太陽高度及方位的計算。",
    ],
    [
      "Passing angular checks does not validate the entire financial forecast.",
      "角度計算通過不代表整份財務預測已獲驗證。",
    ],
  ],
  [
    "pvlib · shading geometry",
    "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.shading.shaded_fraction1d.html",
    ["25 implementation cross-check cases", "25 個實作交叉核對案例"],
    [
      "Checks the infinite-row ray geometry used by the model.",
      "核對模型使用的無限排長光線幾何。",
    ],
    [
      "Real finite arrays and electrical shade losses still use disclosed approximations.",
      "真實有限排長及遮擋電損仍採用明示近似。",
    ],
  ],
  [
    "pvlib · ModelChain / PVWatts",
    "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.modelchain.ModelChain.with_pvwatts.html",
    ["Three full-year reference configurations", "三組完整年度參考配置"],
    [
      "Compares annual and monthly energy against a second model pipeline.",
      "對照另一計算流程的全年與每月發電量。",
    ],
    [
      "Shared weather and components; agreement is not independent field accuracy. Runtime pvlib is pinned to 0.15.2; online stable docs may be newer.",
      "共用氣象及部分元件；一致不代表獨立實地準確率。執行版固定為 pvlib 0.15.2，線上 stable 文件可能較新。",
    ],
  ],
  [
    "EMSD · FiT FAQ, 10 July 2026",
    "https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20(TC).pdf",
    ["Policy inputs and preliminary conditions", "政策輸入與初步條件"],
    [
      "Provides the stated tariff and selected continuous-cover village-house conditions.",
      "提供所述電價及部分村屋連續覆蓋安裝條件。",
    ],
    [
      "Not installation approval. The model omits wind, support/fixing and full structural assessment.",
      "不是安裝批准；模型未作風力、支承固定及完整結構評估。",
    ],
  ],
];

export default function EvidenceMap({ t }) {
  return (
    <section className="card evidence-map">
      <h2>
        {t(
          "Is there enough evidence for this decision?",
          "這些數據足以支持甚麼決定？",
        )}
      </h2>
      <p>
        {t(
          "Enough for a transparent preliminary comparison under stated conditions. Actual roof output, installation safety and a guaranteed payback date have not been established.",
          "足以支持條件清楚的初步方案比較；尚未證明個別天台的實際發電量、安裝安全或保證回本日期。",
        )}
      </p>
      <div className="evidence-register">
        {rows.map(([name, url, use, supports, limits]) => (
          <article key={name}>
            <a href={url} target="_blank" rel="noreferrer">
              {name} ↗
            </a>
            <span className="eyebrow">{t(...use)}</span>
            <p>{t(...supports)}</p>
            <p className="microcopy">{t(...limits)}</p>
          </article>
        ))}
      </div>
      <div className="evidence-assumptions">
        <h3>
          {t("Inputs still supplied as assumptions", "仍然使用假設的參數")}
        </h3>
        <p>
          {t(
            "The generic 450 W module, rack mass, system factor, degradation, maintenance and installation estimate are editable or declared engineering assumptions. Typing a product name into the source field does not load that product's specifications.",
            "通用 450 W 面板、支架重量、系統係數、衰減、維護及安裝費估算屬可調或明示工程假設。在來源欄輸入產品名，不會自動載入該產品的規格。",
          )}
        </p>
        <p>
          {t(
            "User interviews and measured rooftop generation are not claimed. Reference-case checks demonstrate the simulation; interviews and site data are separate future validation work.",
            "本項目沒有聲稱已完成用戶訪談或真實天台發電驗證。參考案例用來核對模擬；訪談和實地數據是另外的後續驗證工作。",
          )}
        </p>
      </div>
    </section>
  );
}
