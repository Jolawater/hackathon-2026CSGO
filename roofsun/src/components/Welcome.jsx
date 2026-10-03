import React, { useState } from "react";

export default function Welcome({ t, onStart }) {
  const [own, setOwn] = useState(false);
  const [roof, setRoof] = useState({
    width: "",
    depth: "",
    price: "",
    date: "",
  });
  const valid =
    Number(roof.width) >= 2 &&
    Number(roof.width) <= 30 &&
    Number(roof.depth) >= 2 &&
    Number(roof.depth) <= 30 &&
    Number(roof.price) > 0 &&
    Number(roof.price) <= 100000 &&
    roof.date >= "2026-01-01" &&
    roof.date <= "2033-12-31";
  return (
    <main className="welcome workbench">
      <span className="eyebrow">ROOFSUN / YOUR ROOF, EXPLAINED</span>
      <h1>
        {t(
          "Before buying panels, try your roof.",
          "先在天台上試一試，再決定買不買。",
        )}
      </h1>
      <p>
        {t(
          "Think of this as trying furniture in a room: explore where panels fit, what casts shade, and whether the income could cover the cost.",
          "就像買傢俬前先試擺：看看太陽能板放不放得下、會不會被遮住，以及發電收入能否補回安裝費。",
        )}
      </p>
      <div className="welcome-paths">
        <button
          aria-label={t("Use my rooftop", "分析我的天台")}
          onClick={() => setOwn(true)}
        >
          <strong>{t("Use my rooftop", "分析我的天台")}</strong>
          <small>
            {t(
              "Start with your measurements and a quote.",
              "先填尺寸和報價，再看結果。",
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
              "An assumed village roof, clearly labelled as a demo.",
              "用假設的村屋天台體驗，不當作你家的結果。",
            )}
          </small>
        </button>
      </div>
      {own && (
        <form
          className="welcome-form card"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onStart("personal", roof);
          }}
        >
          <h2>{t("Four details to get started", "先告訴我們四件事")}</h2>
          <div className="field-pair">
            {[
              ["width", t("Usable roof width (m)", "可用天台左右寬度（米）")],
              ["depth", t("Usable roof depth (m)", "可用天台前後長度（米）")],
              [
                "price",
                t("Installer quote per kW (HK$)", "每 kW 安裝報價（港元）"),
              ],
              ["date", t("Expected start date", "預計開始發電日期")],
            ].map(([key, label]) => (
              <label className="number-field" key={key}>
                <span>{label}</span>
                <input
                  required
                  aria-label={label}
                  type={key === "date" ? "date" : "number"}
                  min={key === "date" ? "2026-01-01" : key === "price" ? 1 : 2}
                  max={
                    key === "date"
                      ? "2033-12-31"
                      : key === "price"
                        ? 100000
                        : 30
                  }
                  step={key === "date" ? undefined : "any"}
                  value={roof[key]}
                  onChange={(e) => setRoof({ ...roof, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p>
            {t(
              "No quote yet? Try the example instead. Shading, covered building area and other costs still need checking on the next screen; entered roof area is only an initial area assumption.",
              "還沒有報價？可以先試玩示例。下一步仍要核對遮擋、整幢屋宇有蓋面積和其他費用；初始面積會暫按你輸入的天台面積。",
            )}
          </p>
          <button disabled={!valid}>
            {t("Continue with these inputs", "用這些資料開始")}
          </button>
        </form>
      )}
      <div className="welcome-steps">
        <article>
          <b>01</b>
          <h3>{t("Make room", "放不放得下？")}</h3>
          <p>
            {t(
              "Leave space for access, rather than filling every corner.",
              "像安排座位一樣，放板之餘也要留出走動和維修空間。",
            )}
          </p>
        </article>
        <article>
          <b>02</b>
          <h3>{t("Follow the sunshine", "曬不曬得到？")}</h3>
          <p>
            {t(
              "A taller neighbour can act like a curtain at certain hours.",
              "旁邊高樓就像窗簾，會在某些時間擋住陽光。",
            )}
          </p>
        </article>
        <article>
          <b>03</b>
          <h3>{t("Compare the bill", "多裝值不值得？")}</h3>
          <p>
            {t(
              "Compare the extra electricity with extra spending and occupied space.",
              "把多發的電、多花的錢和多佔的空間放在一起比較。",
            )}
          </p>
        </article>
      </div>
    </main>
  );
}
