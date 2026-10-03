import React from "react";
import { ShieldCheck, Layers, Check, ExternalLink } from "lucide-react";
import { useApi } from "../lib/api.js";
import { ReferenceEvidence } from "./Evidence.jsx";
export default function Validation({ t }) {
  const { data: meta, error } = useApi("/api/meta", undefined, 0),
    { data: validation } = useApi("/api/validation", undefined, 0);
  return (
    <main className="validation-view">
      <div className="page-intro">
        <span className="eyebrow">{t("UNDER THE MODEL", "模型依據")}</span>
        <h1>{t("Know what goes into your result.", "了解結果的依據。")}</h1>
        <p>
          {t(
            "Reference data, reproducible checks and the assumptions behind every configuration.",
            "參考數據、可重現的檢查，以及每個配置背後的假設。",
          )}
        </p>
      </div>
      {error && <p className="error-banner">{error}</p>}
      <div className="validation-grid">
        <section className="card">
          <div className="card-title">
            <ShieldCheck size={20} />
            <h2>{t("Model checks", "模型檢查")}</h2>
          </div>
          <p className="muted">
            {t(
              "These are software and relationship checks, not field validation of annual yield.",
              "以下是軟件及物理關係檢查，不代表全年發電量已經實地驗證。",
            )}
          </p>
          {validation ? (
            validation.checks.map((c, i) => (
              <div className="check-row" key={i}>
                <Check size={16} />
                <div>
                  <strong>{t(c.name_en, c.name_zh)}</strong>
                  <p>{t(c.description_en, c.description_zh)}</p>
                  <code>{c.observed}</code>
                  {c.source_url && (
                    <a
                      className="check-source"
                      href={c.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("Reference source", "參考來源")}{" "}
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p>{t("Loading validation report…", "正在載入檢查報告…")}</p>
          )}
        </section>
        <section className="card">
          <div className="card-title">
            <Layers size={20} />
            <h2>{t("Data & assumptions", "數據與假設")}</h2>
          </div>
          <dl className="source-list">
            <dt>{t("Weather", "氣象")}</dt>
            <dd>
              NASA POWER · 2023 / 2024 / 2025 · 8,760 / 8,784 / 8,760{" "}
              {t("hourly samples", "逐小時資料")}
              <p>
                {t(
                  "One gridded reference location at 22.45° N, 114.16° E. Used for all rooftops; not an address-specific measurement. UTC data converted to Hong Kong time.",
                  "所有天台採用北緯 22.45°、東經 114.16° 的網格參考資料，並非個別地址實測。UTC 資料轉為香港時間。",
                )}
              </p>
              <a
                href="https://power.larc.nasa.gov/docs/services/api/temporal/hourly/"
                target="_blank"
                rel="noreferrer"
              >
                NASA POWER <ExternalLink size={12} />
              </a>
            </dd>
            <dt>{t("Reference module", "參考面板")}</dt>
            <dd>
              450 W · 1.762 × 1.134 m · 22 kg
              <p>
                {t(
                  "Generic engineering assumptions; not a selected commercial product. Rack weight: 8 kg/module; system factor: 0.85; annual degradation: 0.5%.",
                  "一般工程假設，並非指定商品。支架每板 8 kg、系統係數 0.85、年衰減 0.5%。",
                )}
              </p>
            </dd>
            <dt>{t("Policy reference", "政策依據")}</dt>
            <dd>
              {t(
                "EMSD FiT FAQ · checked 2 Oct 2026",
                "機電署上網電價常見問題 · 2026 年 10 月 2 日核對",
              )}
              <p>
                {t(
                  "Continuous-cover village-house case only. Module + rack + user-added mass check excludes wind forces and fixing design; it does not establish structural safety.",
                  "只考慮村屋連續覆蓋安裝情形。可計入面板、支架及用戶輸入額外重量，未評估風力與固定設計，不能據此判定結構安全。",
                )}
              </p>
              <a
                href={
                  meta?.settings.policy.source_url ||
                  "https://re.emsd.gov.hk/tc_chi/fit/int/fit_int.html"
                }
                target="_blank"
                rel="noreferrer"
              >
                {t("Official source", "官方來源")} <ExternalLink size={12} />
              </a>
            </dd>
            <dt>{t("Financial assumptions", "財務假設")}</dt>
            <dd>
              {t(
                "Editable quote and costs. 25-year life; one inverter replacement at year 10. Simple cash flow plus discounted NPV, editable cost inflation and sustained payback. Taxes and financing excluded.",
                "報價與費用可修改。壽命 25 年，第 10 年更換一次逆變器。同時提供簡單現金流、折現淨現值、可調費用通脹及持續回本；未計稅項及融資。",
              )}
            </dd>
          </dl>
        </section>
      </div>
      <section className="card evidence-card">
        <h2>{t("Generation reference cases", "發電量參考案例")}</h2>
        {validation?.references?.map((r, i) => (
          <ReferenceEvidence reference={r} t={t} key={i} />
        ))}
        {validation?.weather_years && (
          <p className="microcopy">
            {t(
              "Bundled weather years and SHA-256 fingerprints are included in exports for reproducibility.",
              "匯出檔案含各年氣象資料及 SHA-256 指紋，方便復核。",
            )}
          </p>
        )}
      </section>
      <section className="card limitations">
        <h2>{t("What the model leaves out", "模型未涵蓋的因素")}</h2>
        <p>
          {t(
            "Finite-row correction models adjacent parallel segments only. Rooftop objects use module-centre direct-beam rays, not partial-module or diffuse shadows. Optional Martinez electrical loss depends on assumed block wiring; neither mode is measured calibration. Sky-view correction uses a horizontal approximation. No diffuse row self-shading, glass incidence-angle loss, detailed inverter clipping, structural design or address-specific weather. Future self-consumption depends on actual load and electrical arrangements; it is a scenario, not a guaranteed income.",
            "有限排長修正只計相鄰平行排。天台物件用面板中心直射光線近似，未求解局部及散射陰影。可選 Martinez 電損取決於假設區塊接線，兩種模式均未以實測校準。天空可視因子採水平面近似；未計排間散射遮陰、玻璃入射角損失、詳細逆變器削峰、結構設計與地址專屬氣象。未來自用取決於實際用電及電力安排，只是情景假設，並非保證收入。",
          )}
        </p>
      </section>
    </main>
  );
}
