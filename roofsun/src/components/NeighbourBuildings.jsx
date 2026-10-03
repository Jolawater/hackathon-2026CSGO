import React from "react";
import { NumberField } from "./Controls.jsx";
export default function NeighbourBuildings({ inputs, change, t }) {
  const objects = inputs.neighbours || [];
  const edit = (i, key, value) =>
    change(
      "neighbours",
      objects.map((o, j) => (i === j ? { ...o, [key]: value } : o)),
    );
  return (
    <section className="neighbour-buildings">
      <h3>
        {t("Neighbour buildings with measured dimensions", "按尺寸設置鄰樓")}
      </h3>
      <p>
        {t(
          "Origin is the roof’s lower-left corner. X follows width, Y follows length. Height means metres above your rooftop, not total building height. Keep these buildings outside the roof. Measurements you enter affect both the scene and direct-beam shading; they are not a survey.",
          "以天台左下角為起點，X 沿寬度、Y 沿長度。高度填鄰樓高出你家天台多少米，不是整幢樓高。鄰樓必須在天台外；輸入尺寸會同時影響畫面和直射遮擋估算，不代表已完成實地勘測。",
        )}
      </p>
      {objects.map((o, i) => (
        <div className="neighbour-building" key={i}>
          <strong>
            {t("Neighbour", "鄰樓")} {i + 1}
          </strong>
          <div className="everyday-grid">
            {[
              ["x", "X", -200, 200],
              ["y", "Y", -200, 200],
              ["width", t("Width", "寬"), 0.1, 100],
              ["depth", t("Length", "長"), 0.1, 100],
              ["height", t("Height above roof", "高出天台"), 0.1, 100],
            ].map(([key, label, min, max]) => (
              <NumberField
                key={key}
                label={`${label} ${i + 1}`}
                value={o[key]}
                min={min}
                max={max}
                step={0.1}
                unit="m"
                onChange={(v) => edit(i, key, v)}
              />
            ))}
          </div>
          <button
            onClick={() =>
              change(
                "neighbours",
                objects.filter((_, j) => j !== i),
              )
            }
          >
            {t("Remove building", "移除鄰樓")}
          </button>
        </div>
      ))}
      <button
        disabled={objects.length >= 6}
        onClick={() =>
          change("neighbours", [
            ...objects,
            { x: 0, y: -12, width: 8, depth: 6, height: 9 },
          ])
        }
      >
        {t(
          "Add neighbour (editable example dimensions)",
          "新增鄰樓（先填可修改的示例尺寸）",
        )}
      </button>
      <p className="microcopy">
        {t(
          "Avoid counting the same building twice: clear the old horizon shading if it describes this building.",
          "避免同一鄰樓重複計算：若舊的遮擋角度代表這幢樓，請清除舊設定。",
        )}
      </p>
      <button
        className="text-button"
        onClick={() => change("horizon", Array(12).fill(0))}
      >
        {t("Clear old horizon angles", "清除舊的遮擋角度")}
      </button>
    </section>
  );
}
