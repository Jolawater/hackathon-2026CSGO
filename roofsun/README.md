# RoofSun HK 天台太陽能設計工作台

A bilingual, working rooftop solar simulator for HacKU 2026 Problem 3. Change roof geometry, surrounding obstruction, module tilt, direction and row count; compare hourly-modelled generation, initial cost and cash flow.

雙語天台太陽能模擬器，對應 HacKU 2026 題目三。修改天台尺寸、周圍遮擋、面板傾角、朝向及排數，探索發電量、投入與現金流的取捨。

## Branch and project location 分支與位置

All RoofSun source lives in **`roofsun/` on `Jim's-RoofSun-HK`**. Existing repository files are unrelated and are not needed to run this product. This work does not modify or merge into `main`.

```bash
git clone --single-branch --branch "Jim's-RoofSun-HK" https://github.com/Jolawater/hackathon-2026CSGO.git
cd hackathon-2026CSGO/roofsun
```

## Run the finished website 運行完整網站

Requirements: Python **3.12 or newer**, Node **20.19 or newer**, npm. An internet connection is required for installation, but not for simulation after setup. No API keys, account or cloud service is needed.

macOS / Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm run build
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
npm ci
npm run build
.venv\Scripts\python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. The production build and calculation API are served together. To share on a trusted local network, bind to `0.0.0.0` and open this computer's local IP address on another device. The application has no authentication; do not expose it directly to the public internet without a reverse proxy/access controls.

開啟 **http://127.0.0.1:8000**。前端及計算 API 同時由 Python 提供服務。資料已附在倉庫中，不需現場下載。字體使用本機後備字體，即使沒有網絡仍可正常操作。

### Development 開發

Run these commands in two terminals inside `roofsun/`:

```bash
.venv/bin/python -m uvicorn backend.app:app --reload --port 8000
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to port 8000. Run `npm run build` after changes for the finished single-server version; restart Python after the initial build so it mounts the static files.

## Product features 功能

- English / Traditional Chinese interface with device-local language preference.
- Three **illustrative** rooftop scenarios and editable custom geometry.
- Twelve-direction horizon profile; angles interpolate circularly between north and 360°.
- Rotated rectangular roof, 0.5 m edge margin, portrait modules and equally spaced rows.
- Perspective/plan layout and sun/shadow preview for four seasonal dates in Hong Kong time.
- Live tilt, azimuth and row-count controls, with recalculated hourly generation.
- Annual and monthly generation, shade losses and preliminary geometry/coverage/load checks.
- 210-configuration search; cost–generation Pareto frontier; three explainable recommendations.
- Two saved design snapshots, restore controls and JSON export.
- Monthly cash flow through a 25-year assumed life, FiT cutoff and optional post-FiT self-use.
- Model/source page with a reproducible generated validation report.

## What is real and what is assumed 真實資料與假設

**Weather:** bundled NASA POWER 2025 hourly satellite/model data at 22.45° N, 114.16° E. This is one grid/reference location used for every rooftop; local rooftop weather is not measured. Original source URL, header and units are in `data/weather_metadata.json`. UTC timestamps are converted to Hong Kong time; interval-midpoint solar geometry is used. Hourly Wh/m² is numerically the hourly mean W/m² over a one-hour interval.

**Policy:** FiT and the selected village-house continuous-cover checks refer to EMSD's 10 July 2026 FAQ, checked 2 October 2026. Eligibility and structural safety require further professional review. The 640 HK$ fixed-cost example is editable and is not a complete installation-cost breakdown.

**Panel and quote:** 450 W, dimensions, module/rack mass, temperature coefficient, system factor, lifetime, degradation, quote, maintenance and replacement cost are explicitly assumed reference values. They are not a commercial quotation or a verified manufacturer's module specification.

**Post-2033:** the conservative case earns no subsequent income. The optional self-use case multiplies generation by a user-entered avoided tariff and self-use fraction. This does not promise that grid export can be paid at a retail tariff, that all generation can be self-consumed, or that the electrical arrangement will allow self-use.

## Model and decision rules 模型及決策規則

1. pvlib NREL SPA solar position at the midpoint of every weather hour.
2. Erbs decomposition of GHI; isotropic tilted-plane irradiance with assumed albedo 0.2.
3. Circular horizon-angle interpolation blocks direct beam; horizontal sky-view factor approximates diffuse obstruction.
4. Ray/plane row-shadow fraction, using actual row positions. Upstream row direction switches if the sun is on the other side. Direct-beam loss is proportional to shaded area.
5. NOCT temperature estimate, negative power-temperature coefficient and system factor 0.85. Hourly powers aggregate to monthly and annual energy.
6. Coverage is the convex hull of module footprints (including gaps). Load uses module + rack mass divided by that area, excluding ballast and wind effects. Failed configurations are excluded from recommendations but remain inspectable as the current design.
7. Search: tilts 0/10/20/30/40°, directions 90/120/150/180/210/240/270°, 1–6 rows = 210 candidates. Interactive sliders permit finer values, so recommendations are **best within this discrete search**, not a guarantee of a globally optimal layout. The effective roof is eroded by a module footprint to find legal row-centre positions. Single rows are centred; multirow designs spread rows equally across the legal row-centre range. Rows cannot overlap and each module must fit completely inside the edge clearance.
8. A Pareto configuration has no feasible alternative costing no more and generating no less with one strict improvement. Lower investment and more generation select its endpoints. Balanced minimizes the sum of squared normalized distance from minimum cost and maximum generation. Endpoints can coincide; no artificial trade-off is invented.
9. FiT depends on total nameplate capacity: ≤10 kW / >10–200 kW / >200 kW use 4 / 3 / 2.5 HK$/kWh. With this roof-size limit the large-system tier is unlikely to be reached. The participating tariff applies through 31 December 2033. Subsequent revenue follows the selected explicit scenario.
10. Monthly revenue uses seasonal production, commissioning-date proration and ageing. Maintenance continues throughout life; an assumed inverter replacement occurs once at the tenth commissioning anniversary. First break-even is the first nonnegative month-end. No discounting, inflation, taxes or financing is included.

### Known limitations 已知限制

Infinite-row shading neglects finite row ends and local objects. Linear shade loss omits bypass-diode electrical effects; horizontal sky-view correction is approximate for tilted panels. No incidence-angle optical loss, detailed inverter clipping, wind/ballast/structural calculation or real measured rooftop validation. Current results are preliminary exploration, not an installation approval or investment guarantee.

## Verify 驗證

```bash
.venv/bin/python -m pytest -q
.venv/bin/python scripts/validate.py
npm run build
```

For browser checks, start the development/API servers, then:

```bash
npx playwright install chromium
npm run test:browser
```

`scripts/validate.py` checks a published NREL SPA example, our row-shadow implementation against 25 pvlib reference cases, weather integrity, shading monotonicity, monthly energy aggregation and search output. `data/validation.json` is generated only if checks pass. These checks do not establish annual real-world generation accuracy. `tests/` also checks rotated geometry, invalid API inputs, financial cutoff/replacement and non-dominated recommendations.

### Refresh weather 更新氣象資料

```bash
.venv/bin/python scripts/download_weather.py
.venv/bin/python scripts/validate.py
```

This is an explicit developer operation. The running website never downloads weather or silently substitutes fabricated hourly data.

## Repository map 檔案結構

```text
roofsun/
  src/                  bilingual interface, scene, charts and comparisons
  backend/model.py      layout, shading, solar yield, finances and search
  backend/app.py        validated API and production static serving
  data/                 source weather, policy/assumptions and validation report
  scripts/              reproducible data/validation/browser checks
  tests/                numerical, geometry and API regression tests
  package-lock.json     locked frontend dependencies
  requirements.txt      pinned primary Python dependencies
  requirements-lock.txt complete tested Python dependency versions
```

## Sources 資料來源

- [NASA POWER hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/)
- [EMSD FiT FAQ, 10 July 2026](<https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20(TC).pdf>)
- [pvlib 0.15.2 documentation](https://pvlib-python.readthedocs.io/en/v0.15.2/)
- [NREL SPA technical report, reference example](https://www.nrel.gov/docs/fy08osti/34302.pdf)

No user addresses, accounts or personal identifiers are collected. Saved designs are held in browser memory until refresh; only the language preference uses local storage. Exported JSON is downloaded locally.
