# 圖表及 3D 方案 v2 執行紀錄

日期：2026-10-03（香港）。基準：`5f88abf`。只修改 `Jim's-RoofSun-HK` 的 `roofsun/`。

本次依提供的 `RoofSun_图表方案.md` §4 按四步各自提交。來源分支 `JESON-ROOFTOPJIM` 的 `51854cf` 僅作唯讀參考及組件移植，沒有合併。

## 第 1 步：保守情景停用

A 在 `fit_end` 後收入、維護及逆變器更換費均為零；B 保持原有公式。期中截止按日比例計維護，只有截止前的十週年才會在 A 更換逆變器。現金流圖的保守線因此在上網電價結束後持平。這是**停用假設**，未包含拆除費，並已加進中英假設表。

模型版本更新為 3.1.0。新增測試獨立重算原有 B 曲線，確認完全保留；測試 A 截止後不變、預設 NPV／報價及期中截止。

預設推薦配置的 A 淨現值約 HK$18.3k，最高可接受安裝報價約 HK$28.4k/kW，三檔結論仍為「勉強」。精確數值來自生成的驗證報告，不抄文件的示例數字。

## Step 2 — Monthly generation and independent seasonal evidence

- Current-layout-only Recharts bars use `monthly_kwh`, integer nice ticks, two extreme labels and kWh/kW tooltips; row changes replace the chart data.
- `scripts/hko_check.py` sums original HKO daily observations into monthly kWh/m² and calculates Pearson r against the selected model configuration. Neither monthly observations nor correlation are copied from the task’s rounded table.
- Default computed correlation is 0.961149 (about 0.96; the task’s 0.962 was rounded from a different calculation). It compares seasonal shapes in different units, not measured panel accuracy. Evidence shows all 12 monthly pairs; constant zero output reports no correlation.
- Validation: 89 pytest cases, 15 reproducible checks, production build and browser suite passed, including monthly data changes, tooltip units, two labels and the monthly evidence table.

## Step 3 — Monthly cumulative cash

The chart requests `/api/evaluate` with the screen’s mapped inputs and selected configuration. It shows all 301 dated points (initial payment plus 300 months) over the default 25-year horizon. Y is undiscounted cumulative net cash, with integer ticks; the chosen A/B scenario is solid, the alternative dashed. Zero and the actual FiT cutoff are reference lines. Installation, sustained payback, cutoff and B’s year-ten replacement are annotated from actual model dates/costs, with bilingual readable milestones below the chart.

Default simulated values: initial HK$−140,000; sustained payback 2032-05; FiT-end/terminal A HK$41,180; terminal B HK$108,270. The replacement allowance is HK$5,000, not the HK$5,025 total of replacement plus that month’s maintenance; the curve also includes income in that month. No example month values were hardcoded. Changing inputs synchronously hides stale cash-flow data until the matching API response arrives.

Validation: 90 pytest cases, production build and browser suite passed; both curves, two reference lines, initial/final/API agreement and selected-scenario switching are checked. The original SVG remains until step 4.

## Step 4 — Restricted 3D transplant

- Adapted only `RoofScene3D.jsx` from `JESON-ROOFTOPJIM@51854cf`; no merge or checkout of the source branch. Added exact `three@0.180.0`, React.lazy/Suspense and an error boundary. The original SVG handles unsupported/lost WebGL and loading failure.
- Removed manual module placement/rotation, height selectors and horizon-inverted neighbour silhouettes. The southern facade derives directly from input 3: floors × 3 m, entered edge distance and a 120° sector. The own 9 m building body and 3 m facade depth are **visual assumptions** disclosed in the UI and README; no surveyed-building claim is made. Geometric raster shadows are illustrative; energy continues to use the documented horizon approximation.
- Added 145 five-minute pvlib samples, with beam visibility, row shade and affected-module count. A separate `/api/evaluate.winter_solstice_noon` exposes the identical noon snapshot; annual row-loss percentages are not confused with instantaneous shade fractions. The 12-second playback interpolates normalized sunlight directions and selects the nearest sample for shade highlighting.
- Retained 2048 PCF soft shadows, hemisphere light, daylight-dependent illumination and the camera collision guard. The light frustum fits actual roof/module/neighbour bounds. Southeast view, polar/zoom limits and a Reset button are supported; reset clears orbit inertia and is checked against actual camera coordinates. Compass lettering follows orbit and all eight roof bearings. The corner overlay shows time, elevation, azimuth and X/N shaded modules.
- No automatic playback, including systems requesting reduced motion. Exactly seven input groups and two foldouts remain. Chart components are memoized so RAF playback does not repeatedly redraw the two charts.
- Observed production build: lazy Three chunk **128.08 kB gzip**, 3D component about **5.5 kB gzip**. No Three chunk appears in the HTML's eager module preloads. Vite emits a non-failing warning about the raw 510.78 kB Three chunk; it is separately lazy-loaded rather than added to the initial application bundle.

Final validation: **93 pytest tests passed**, **16 generated model/evidence checks passed**, `npm run build` passed, `npm run test:browser` passed. Browser checks cover both charts and their data, actual row-change yield, canvas, advancing clock, nonzero three-row shade agreement, camera orbit/zoom/reset, compass, bilingual text, 375 px layout, unsupported WebGL→SVG and reduced-motion non-autoplay. Desktop, three-row and mobile screenshots were inspected. The four steps are separate commits, exclusively under `roofsun/` on `Jim's-RoofSun-HK`.

The real village-house meter reference is still **pending**: no field readings were supplied and none were invented. The seasonal coefficient is the computed 0.961149, not the task table's approximate 0.962. All monetary milestones remain simulated and use recomputed API data.
