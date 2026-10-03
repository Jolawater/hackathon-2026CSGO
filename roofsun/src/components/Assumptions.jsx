import React from "react";
import document from "../../data/owner_assumptions.json";
export default function Assumptions({ zh, t, calibration }) {
  return (
    <div className="assumptions-content">
      <p className="help">
        {t(
          "The Chinese table preserves the supplied team document verbatim. Values labelled assumptions are not installer quotations or certified designs.",
          "中文表格保留團隊文件原文。標示「假設」的數值並非安裝商報價或認證設計。",
        )}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("Item", "項目")}</th>
              <th>{t("Value used", "我們用的值")}</th>
              <th>{t("What it means", "這是甚麼意思")}</th>
            </tr>
          </thead>
          <tbody>
            {document.rows.map((row, i) => {
              const cells = zh ? row.zh : row.en;
              return (
                <tr key={i}>
                  <th scope="row">{cells[0]}</th>
                  <td>{cells[1]}</td>
                  <td>
                    {cells[2]}
                    <br />
                    <span className="source-label">{cells[3]}</span>
                    {row.urls.map((url, j) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        {t("Source", "來源")}
                        {row.urls.length > 1 ? ` ${j + 1}` : ""}
                      </a>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="help">
        {t(
          "Implementation notes: panel dimensions are rounded in the table; the unchanged model uses 1.762 × 1.134 m and calculates NOCT temperature effects separately. The 0.3 m gap is a screening assumption, not a certified access width.",
          "實作補充：表內面板尺寸已四捨五入，原有模型使用 1.762 × 1.134 m，並另計 NOCT 溫度效應。0.3 m 間隙屬篩選假設，並非經認證的通道闊度。",
        )}
      </p>
      <p className="help">
        {t(
          `The exact 2025 weather multiplier is ${calibration?.years?.find((r) => r.year === 2025)?.ratio.toFixed(6) ?? "…"}, calculated from bundled CSVs. The table shows its rounded value. Completion uses the first day of the chosen month; door direction approximates roof rotation.`,
          `2025 年實際天氣比例為 ${calibration?.years?.find((r) => r.year === 2025)?.ratio.toFixed(6) ?? "…"}，由所附 CSV 計算，表內顯示約數。投產按所選月份首日計算；正門方向用作天台旋轉方向的近似。`,
        )}
      </p>
    </div>
  );
}
