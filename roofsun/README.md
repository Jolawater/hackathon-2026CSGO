# RoofSun HK · 七項輸入，先算清楚

**v3.1.0 · 聯絡安裝商前的初步篩選工具 / Preliminary screening before contacting an installer.**

香港村屋太陽能的雙語篩選網站，為 HacKU 2026 Deep Tech Problem 3「Test the Change Before You Make It」製作。只有一個介面、七組業主輸入，沒有專業模式。結果屬模擬，並非工程設計或財務建議；不代表已通過結構或法規審批。

A single bilingual interface answers whether the selected quote could pay back, suggests a layout, and shows what changes when another row is added. Only `roofsun/` on `Jim's-RoofSun-HK` is changed. The physical, packing and shade equations remain intact. v3.1 follows the chart specification: conservative scenario A shuts down after FiT; self-use scenario B retains its previous cash-flow calculation.

## 本機啟動 / Run locally

Python 3.12+ and Node.js 22+ are required. From `roofsun/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
python scripts/hko_check.py
npm run build
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/**. Production serves the website and API from one origin. Weather, calibration and fonts are bundled; after setup, runtime needs no external API, account or internet connection. For development, use `--reload` and run `npm run dev` in a second terminal (port 5173 proxies the API).

完成安裝及建置後可離線使用。終端機的伺服器程序需要保持運行。

## 七項輸入 / Seven owner inputs

| # | 問題 / Question | 換算 / Mapping |
|---|---|---|
| 1 | 可放板長方形的長、闊 / Clear rectangle length and width | `roof` → `depth`, `width`; `house_area = width × depth`; `exclusions = []` |
| 2 | 正門朝向 / Front-door direction | Eight compass buttons → `roof_rotation` = 0, 45, …, 315° |
| 3 | 南面鄰屋高出幾層、相距幾米 / Southern neighbour floors and distance | `neighbour` → 12-value horizon; assumed 3 m/floor, centred south, 120° sector |
| 4 | 每千瓦安裝報價 / Installation quote per kW | `price_per_kw`; HK$20k/25k/30k buttons are **assumed reference prices**, not market quotations |
| 5 | 其他費用低、中、高 / Other-cost allowance | `cost_band` → setup, annual maintenance and year-10 inverter replacement; see assumptions below |
| 6 | 完工年月 / Completion month | `commissioning_month` → first day of that month (**assumption**) |
| 7 | 2033 年後自用 / Self-use after 2033 | `post_fit`; defaults off; if on, assumed 50% self-use at HK$1.4/kWh |

尺寸及預設價格是示例假設，請換成實際資料。長闊應已扣除樓梯屋、水箱，模型再保留原有假設的 0.5 m 邊距。把這塊空間當作有蓋面積會縮小覆蓋上限；正門朝向只是天台旋轉的近似。這些簡化不適用於所有天台。

The front door approximates roof rotation; it does not set panel azimuth. The existing search chooses panel tilt, azimuth, rows, compact/spread layout and its existing module-cap candidates. It selects **highest current-scenario NPV among tested feasible systems of at least 2 kW**. It retains negative-value candidates for explanation, rather than filtering them out before scenario classification. This is a searched candidate, not a proven global optimum or a recommendation to install at any cost.

固定假設包括 Martinez 電氣遮擋、3 個旁路分段、有限排實際重疊、4% 折現、0% 費用通脹、0.3 m 最小水平間隙、70% 每排填充率、2 kW 最小系統、零額外壓重、150 kg/m² 平均荷載上限。除了有註明來源的政策數值，其餘均屬模型設定或假設。預算及回本目標不再作介面輸入。

## 結果與取捨 / Results and trade-off

- 三檔結論：**值得裝**＝三個情景 NPV 全部 >0；**勉強**＝至少一個 >0，但不是全部；**不建議**＝全部 ≤0，或沒有通過物理檢查的最小系統。
- 三個主要數字：首年發電、**持續**回本時間、當前情景下令 NPV=0 的最高可接受安裝報價／kW。無可行系統時顯示「—」；有系統但 25 年內未持續回本時明確說明。
- 「再加一排／少一排」選出相鄰排數中 NPV 最高的可行配置；**每個排數會重新搜尋傾角及朝向**。卡片顯示發電、安裝費、回本月份差、遮擋及每千瓦發電的變化。沒有可行相鄰排數便停用按鈕，不製造違規排布。
- 3D 陰影預覽固定為 **2025 年冬至、香港時間 12:00**；「播放一天」播放 06:00–18:00，停止／完成後回到正午。播放不改全年結果。
- 延遲六個月提示使用**同一配置的 NPV 差**，不是保證少賺的現金額。只在容量超過 10 kW 時提示 FiT 分檔。荷載提示明確排除颱風壓重。

Sustained payback means the first month after which all remaining modelled cash balances stay non-negative. The installation quote ceiling subtracts the separate setup allowance before dividing by kW; avoid double counting setup if the installer supplied an all-in quote. A positive current NPV does not guarantee a positive conservative scenario.

The three points use the **same configuration**: combined HKO/NASA ratio with 8% discount; 2025 ratio with 4%; unscaled NASA with 0%. The range is **not a confidence interval, probability or exhaustive worst case**. The three-point conclusion and sensitivity checks evaluate the system recommendation, even when the scene explores an adjacent row count. Monthly seasonal evidence follows the currently displayed layout.

## 天文台資料及復算 / HKO observations and reproduction

`data/hko_kp_daily_gsr.csv` is the original `daily_KP_GSR_ALL.csv` supplied by the user on 3 October 2026, copied unchanged. Its stated public source is [HKO King's Park daily global solar radiation CSV](https://data.weather.gov.hk/weatherAPI/cis/csvfile/KP/ALL/daily_KP_GSR_ALL.csv). The original file fingerprint and NASA fingerprints are in `data/hko_check.json`.

`python scripts/hko_check.py` checks unique dates and complete calendar-year coverage, rejects missing/negative/nonfinite values, sums daily MJ/m² and divides by 3.6. It divides by the corresponding bundled NASA hourly GHI annual total. All runtime multipliers are read from this generated file; **0.971 is never a hard-coded model coefficient**.

| Year | HKO kWh/m² | NASA kWh/m² | Computed multiplier | Incomplete days |
|---|---:|---:|---:|---:|
| 2023 | 1,418.694 | 1,533.345 | 0.925228 | 2 |
| 2024 | 1,390.325 | 1,470.339 | 0.945581 | 0 |
| 2025 | 1,510.228 | 1,555.599 | 0.970833 | 4 |

The combined ratio is **0.947352** (sum of HKO totals divided by sum of NASA totals). Runtime uses the unrounded calculated values. The supplied plan's 2023 value 0.926 differs from the source calculation; the website reports **0.925** rounded to three decimals. The §4 table retains its original rounded 2025 text, with the precise runtime value in a note.

帶 `#` 的日子保留原始不完整總量及日期標記，沒有補造觀測。天文台提供每日總量；陰影需要逐時資料，所以保留 NASA 的逐時形狀作全年縮放。京士柏與 NASA 的新界參考網格位置不同，香港與 UTC 曆年邊界亦不同；這並非逐小時校準或實測發電準確率。京士柏資料對部分新界天台可能偏保守，不能視為每個天台的已知偏差。

To explicitly replace the source from the public URL, use `python scripts/hko_check.py --download`; then regenerate validation and rerun tests. Ordinary startup and validation use only bundled files. The older `data/hko_reference.json` monthly table and its API remain for backwards compatibility, but the new screen uses the daily-source calculation above. The small monthly/daily total difference is not silently mixed into calibration.

## 兩個只讀面板 / Two read-only panels

**假設與來源 / Assumptions & sources:** `data/owner_assumptions.json` preserves the original 21 Chinese rows of the supplied §4 table verbatim, and supplies plain-language English translations, plus a labelled conservative-shutdown assumption. The main UI uses Hong Kong Traditional Chinese; the supplied table retains its original Simplified Chinese wording, as requested. It includes explicit source/assumption tags and links. Additional notes clarify the exact original module dimensions (1.762 × 1.134 m), separately modelled NOCT temperature, and that 0.3 m is not a certified access width.

**證據與敏感性 / Evidence & sensitivity:** Part A shows three HKO/NASA years, the NREL SPA published example, 25 row-shadow comparisons and three unshaded ModelChain/PVWatts cases. Cross-model comparison uses common weather and components; differing temperature, losses and inverter assumptions explain the reported differences. It is not measured rooftop validation. **The real village-house reference case remains “待補充 / Pending data”; no sample meter readings or field accuracy are invented.**

Part B shows the three-point NPV range and nine one-at-a-time cases: installation quote ±20%; completion +6/+12 months; neighbour +1 floor; high other costs; linear rather than Martinez shade loss; weather 2023/2024 with each year's computed HKO ratio. NPV and verdict keep the current recommended configuration fixed. A separate search answers whether the preferred configuration changes. Changing any owner answer clears stale analysis immediately. Sensitivity is calculated on demand.

## 模型範圍 / Model scope

The physical equations remain unchanged: pvlib NREL SPA; Erbs decomposition; isotropic plane irradiance with assumed albedo 0.2; approximate horizon/sky-view blockage; NOCT temperature and assumed 0.85 system factor; finite adjacent-row overlap; Martinez bypass-block loss; convex-hull cover including row gaps; monthly cash flows with assumed 0.5%/year degradation and a 25-year horizon. A stops all income and costs after FiT; B continues maintenance and one year-10 inverter replacement. Shutdown/removal costs are not included (assumption). The generic reference module assumes 450 W, 22 kg and 8 kg rack; it is not a verified commercial specification.

FiT source: [EMSD introduction](https://re.emsd.gov.hk/tc_chi/fit/int/fit_int.html) and [EMSD FAQ](https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20%28TC%29.pdf). Existing whole-system tiers are ≤10 kW HK$4/kWh; >10–200 kW HK$3; >200 kW HK$2.5, through 2033-12-31. Coverage includes gaps under the existing conservative interpretation. The 65.03 m² village-house scope warning uses [Lands Department guide, Part A printed page 3](https://www.landsd.gov.hk/tc/images/doc/Building%20NT%20Exempted%20Houses_c.pdf); it is a warning, not a legal or structural approval.

未考慮：颱風風荷載、壓重／錨固工程、一般灰塵假設以外的污染、東西北鄰屋、非長方形天台、群組式或樓梯屋頂安裝、完整串聯／MPPT、逆變器削峰、電價調整、稅項及融資。No prediction of structural safety, field accuracy, future tariffs or guaranteed payback is made.

Search remains coarse plus local refinement, over both spread/compact layouts; it includes the existing 22-module/9.9 kW cap candidates but does not exhaust every possible arrangement. Actual row counts, boundary tolerance, coverage and assumed access/fill limits retain their existing checks.

## 檔案與接口 / Files and APIs

`POST /api/screen` accepts `{ "inputs": {…seven fields…}, "selected_rows": null }`. The optional row count is a transient exploration action, not an eighth owner input. `POST /api/analyse` accepts the seven-field shape; the legacy evaluation shape remains supported. `POST /api/import-owner` validates and migrates input records.

JSON export contains **only** `model_version` and the seven owner-input fields. It excludes results, selected layouts, goals, weather/physics overrides and quotation provenance. HTML download records simulated results, assumptions and any current sensitivity evidence; quote source/date are explicitly unverified/unavailable, and the report timestamp is not mislabelled as the quote date.

匯入舊 JSON 時保留可對應的新輸入，其他參數、舊結果及手動排布忽略，並顯示「已按新版固定假設重新計算」。舊檔沒有鄰屋層數／距離，會重設為 **0 層／10 m 的示例假設**並提醒核對；舊旋轉角取最近八方位；費用三元組完全相符才映射到低／中／高，否則重設中檔。沒有把舊天際線假裝當作新的現場量度。

Valid seven-answer records persist locally. Invalid storage falls back to the labelled example. Imports always validate and recalculate; saved result numbers are never trusted.

## 驗證 / Verify

```bash
python -m pytest -q
python scripts/validate.py
npm run build
# Keep the API running at port 8000:
npm run test:browser
```

Install Chromium once if needed: `npx playwright install chromium`. Browser tests default to the production site; `ROOFSUN_TEST_URL` can override it. Screenshots and test downloads go to `/tmp/roofsun-browser-checks/`.

Model tests retain the physical/financial regression suite and add all seven mappings, computed calibration, invalid observations, three-band boundaries, same-configuration NPV points, row trade-offs, nine sensitivities, no-space/late-start cases and archive migration. Browser checks cover the complete seven-input flow, row/play actions, exactly two panels, bilingual content, 375 px widths, minimal exports, stale evidence, failed imports, storage recovery and network retry. GitHub Actions runs the same four checks on this branch.

See [v3 implementation record](docs/SEVEN_INPUTS_V3_RESPONSE.md). Earlier [v2.2 P0 record](docs/REVIEW_V2_P0_RESPONSE.md) and [v2.1 corrections](docs/REVIEW_FIXES_2026-10-03.md) describe historical versions; their old UI instructions do not apply to v3.

### Monthly generation and seasonal evidence

The current layout has a 12-month generation chart, updated by row comparisons. `scripts/hko_check.py` aggregates the bundled original HKO daily readings and computes Pearson correlation against model monthly generation; the evidence panel lists the 12 pairs. The uniform annual calibration preserves NASA’s monthly shape. Seasonal correlation is not measured rooftop yield accuracy.

The cumulative cash-flow chart requests the selected configuration from `/api/evaluate`, draws monthly undiscounted net cash over 25 years and labels actual installation, sustained-payback, FiT-end and B-only inverter-replacement milestones. The selected scenario is solid and the other dashed. NPV remains a separate discounted measure.


### 3D winter-solstice preview / 冬至 3D 預覽

Only `RoofScene3D.jsx` is adapted from `JESON-ROOFTOPJIM@51854cf`; that branch was **not merged**. Three.js **0.180.0** loads in a separate lazy chunk. WebGL creation/context loss or a failed lazy import falls back to the retained SVG. Playback never starts automatically, including reduced-motion systems.

`/api/screen` returns **145 five-minute pvlib samples** over 06:00–18:00 HK time on 2025-12-21. A 12-second requestAnimationFrame playback interpolates unit sunlight directions; amber highlighting and the shaded-panel count use the **nearest backend sample**, with row-shade fractions and horizon beam visibility. `/api/evaluate.winter_solstice_noon` exposes that same instantaneous preview separately from annual `row_losses`. Nighttime has no directly shaded panels. The corner overlay shows time, elevation, azimuth and the shaded-module count; compass directions follow the camera and roof rotation.

Default view is southeast. Orbit polar/zoom limits and building collision bounds keep the camera above/outside the roof; Reset view restores the initial southeast view. Directional light uses 2048 PCFSoftShadowMap, with a shadow frustum recomputed from the roof, module and neighbour bounds. No manual panel placement, rotation or building-height controls are present; the seven inputs and exactly two foldout panels are retained.

Neighbour geometry is generated directly from southern-neighbour floors × 3 m, distance and the 120° facade sector. **Visual assumptions:** own building body 9 m; neighbour facade depth 3 m; facade width = 2 × entered distance × tan(60°); entered distance is from the roof edge. These are illustrations, not surveyed buildings. The energy model still uses its single horizon-sector approximation rather than rasterized/three-dimensional building shadows; amber highlights are authoritative model values. Visual ground/window details are not new shade or generation inputs. No physical energy equation changed in the 3D step.

鄰屋直接按南面、層數 × 3 m、距離及 120° 扇形建圖。樓身 9 m、鄰屋進深 3 m 及扇形立面是畫面假設，不是實測建築。光影展示幾何，琥珀色高亮及被遮面板數目採用後端遮擋樣本；發電仍按已說明的天際線近似計算。拖動只改視角，不改計算配置。

Reproduce all checks from `roofsun/`:

```sh
python -m pytest -q
python scripts/hko_check.py
python scripts/validate.py
npm run build
npm run test:browser
```
