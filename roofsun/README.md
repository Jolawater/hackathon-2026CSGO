# RoofSun HK · 安裝之前，先探索

## JESON-ROOFTOPJIM · final-direction additions

This branch starts from Jim's RoofSun 2.1.0 (427b206). It adds an owner-facing explanation of payback, panel trade-offs and the generation stress case; a linked evidence-sufficiency register; truthful pass/fail/unknown display and validation-report fingerprints. It preserves Jim's model and professional installation scope. No completed interviews, actual installer quotations or measured rooftop output are claimed.

- [比赛定位、criteria 对照、三分钟脚本和提交自查](docs/COMPETITION.md)
- [数据/论文来源、模型解释与证据是否充分](docs/EVIDENCE.md)
- [同步 Jim 分支与本地运行](docs/BRANCH_AND_PREVIEW.md)

After the standard checks below, run `node scripts/owner-browser-test.mjs` against the running server. Both browser scripts support `ROOFSUN_BROWSER_CHANNEL=msedge` for an installed Microsoft Edge. `GET /api/validation` compares saved report fingerprints with current model/input files. Re-run `python scripts/validate.py` after changing those files; a stale report is not evidence that the current implementation passed.


A bilingual engineering decision workbench for Hong Kong village-house solar rooftops. Built for HacKU 2026 Deep Technology Problem 3: **Test the Change Before You Make It**. Product/model version **2.1.0**. Code lives in `roofsun/` on **`Jim's-RoofSun-HK`**; this work does not merge or deploy the repository's other projects.

香港村屋太陽能安裝前的雙語工程決策工作台。可調整排布、比較物理取捨，並按預算、持續回本及收益目標選擇方案或暫緩安裝。**結果為模擬，未聲稱實測準確率，也不能判定結構安全。**

## Run locally / 本機啟動

Requires Python 3.12+ and Node.js 22+. Start inside the `roofsun` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm ci
npm run build
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000/**. The Python server serves the production website and API on one origin. Weather and fonts are bundled: after dependency installation/build, runtime does not require internet or an API key.

開啟上面的本機網址。Python 同時提供網站及 API。資料和字體已包含在專案，安裝依賴及建置後可離線使用。

For development, run the API with `--reload` and `npm run dev` in a second terminal. Vite at port 5173 proxies `/api` to port 8000. Keep the terminal processes running during use.

## Product workflow / 操作流程

1. Choose an illustrative roof or enter width, depth, rotation and building covered area. These areas are separate measurements. If inconsistent, the app asks you to correct them; it does **not** increase building area automatically.
2. Open the screening-goal controls to enable budget/payback caps, edit the assumed 2 kW minimum practical system size, and require positive 25-year net cash flow **and** NPV. Unchecked caps are internally encoded as zero; the UI uses named checkboxes. These are preferences, not guarantees.
3. In Simple mode, enter how many floors the neighbour extends above the module plane, distance, direction and angular width. Apply converts the assumed 3 m/floor geometry into the 12-direction horizon. Advanced mode accepts compass/inclinometer measurements directly. The UI includes measurement guidance. Add up to six rectangular rooftop objects/access exclusions if needed.
4. Adjust tilt, azimuth and rows; optionally limit the exact module count. A 22-module cap gives at most 9.9 kW for the reference 450 W module. Inspect the scene, energy, shading, preliminary coverage/load and finances. Seasonal 2025 sun geometry is a preview; annual energy uses every hour of the selected historical weather year.
5. Compare adjacent row counts at the **same roof, direction, tilt and weather**. See total energy, specific yield, shading, extra investment and marginal energy per extra HK$1,000. Save the pair as A/B.
6. Compare **highest NPV**, **fastest sustained payback** and **highest NPV within 10 kW**. Advanced mode also presents the original three cost/energy frontier choices. The system rejects designs failing budget/financial goals and presents **do not install** as a zero incremental solar-investment/generation baseline. Ordinary household bills are outside both comparisons; optional self-use is incremental avoided expenditure.
7. Run sensitivity/reference checks on demand. Changing inputs makes evidence stale and excludes it from exports until recalculated; expensive analysis does not rerun after each keystroke.
8. Inputs and two saved plans persist in this browser. Export JSON, import and recalculate JSON, or download a standalone HTML decision report that can be printed/saved as PDF. No accounts, addresses or cloud storage are required.

## Model, assumptions and sources / 模型、假設及來源

**Weather.** NASA POWER hourly GHI and temperature at 22.45° N, 114.16° E for 2023, 2024 and 2025. Years have 8,760 / 8,784 / 8,760 samples. This is one gridded reference location for all roofs, not an address-specific measurement. Data covers UTC calendar years; timestamps convert to Hong Kong time and interval-midpoint solar positions are used. This is not a strictly local-calendar-year dataset. Hourly Wh/m² over one hour is numerically equal to hourly mean W/m². Each year's metadata retains source URL, units and native header; API/exports include CSV SHA-256 fingerprints.

**Module.** Generic assumed 450 W portrait reference: 1.762 × 1.134 m, 22 kg, 8 kg rack allowance, NOCT 45°C, power temperature coefficient −0.0035/°C, degradation 0.5%/year. It is **not** a verified manufacturer's model. An editable specification-reference field records provenance only; it does not change these physical parameters.

**Cost.** Default HK$25,000/kW + HK$5,000 setup allowance, HK$300 annual maintenance and HK$5,000 inverter replacement are illustrative, not an installer quotation or complete fixed-cost breakdown. Quote source/date are editable and exported. EMSD FAQ 1.8 describes installed system capital costs in terms of several tens of thousands of HK$ per kW; obtain an actual roof-specific quote. Sensitivity includes ±20% initial quote, an explicitly hypothetical HK$30,000/kW quote and six-month commissioning delay. The HK$30,000 case is not a commercial quotation.

**Physics.** pvlib NREL SPA solar position; Erbs GHI decomposition; isotropic tilted irradiance and albedo 0.2; circular interpolation of horizon blockage and approximate horizontal sky-view factor. NOCT temperature and 0.85 system factor convert irradiance to hourly power. First-year hourly energy aggregates to monthly/annual totals.

**Geometry.** Rectangular roof, assumed 0.5 m edge margin, equally spaced parallel rows, portrait module footprints. Rotated layouts search nine pitches and seventeen translations to maximise complete modules, breaking ties by wider spacing and centring. Boundary intersections use a 1e-8 m tolerance. Panel caps retain a deterministic central subset distributed across rows; trimming does not pretend to preserve a complete-row constraint. Roof erosion locates valid row centres, module polygons cannot overlap or exceed clearance, and exclusion rectangles remove intersecting modules. Continuous-cover area uses the convex hull including intervening gaps. This is a conservative geometric approximation, not a certified regulatory area determination.

**Shading.** The original infinite-row ray/plane relation is retained as a selectable comparison. Default finite-row correction applies lateral overlap of actual adjacent parallel-row segments to the shaded strip. It omits more distant rows and diffuse row self-shading. Objects use **one centre-point direct-beam ray per module** against 3D boxes; partial-module shadows and diffuse object blockage are not solved. The scene shows geometric ground shadows; energy uses the stated approximations.

**Electrical shade sensitivity.** Linear beam loss is default. Optional Martinez-style bypass-block correction multiplies direct irradiance by `(1-f)*(1-ceil(n*f)/(n+1))`; block count/layout is an explicit generic assumption, not verified commercial wiring. This is an approximation, not a complete string/MPPT model. See [pvlib shading example](https://pvlib-python.readthedocs.io/en/stable/gallery/shading/plot_martinez_shade_loss.html).

**Mounting weight.** Anchored preset assumes no additional ballast; ballasted preset assumes 40 kg additional mass per module. Both still include 22 kg module and 8 kg rack. These are adjustable screening assumptions, not certified mounting designs. Wind uplift, anchorage and local support loads remain unmodelled.

**Preliminary conditions.** Continuous-cover village-house case only. Reference coverage ≤50% of building covered area and rooftop load ≤150 kg/m², based on [EMSD's 10 July 2026 FAQ](https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20%28TC%29.pdf). The FAQ specifies 75 kg/m² for stairhood installations; the selected load threshold can be lowered. Load includes module/rack plus user-added assumed mass divided by cover area. Grouped installations, height rules, enclosure, fixing/support design, wind uplift and structural safety are **not** assessed. Extra ballast weight alone cannot establish structural suitability.

**Finance.** Current FiT tiers: ≤10 kW HK$4/kWh, >10–200 kW HK$3/kWh, >200 kW HK$2.5/kWh, with participating tariff income only through the configured 31 December 2033 cutoff. The tariff is applied to the whole system's generation at its tier, not marginal energy. Monthly energy is prorated by commissioning date and aged by degradation. Assumed maintenance continues for 25 years; inverter replacement occurs once at year 10. Editable cost inflation affects maintenance/replacement; editable discount rate gives NPV. Tax, financing, tariff escalation and other replacement costs are omitted. Conservative case has no post-FiT revenue; optional case has generation × entered self-use share × avoided tariff, contingent on demand and electrical arrangements.

**Acceptable quote.** The all-in installation ceiling is the discounted sum of generation income less operating maintenance and inverter replacement. At that price, NPV is zero. The per-kW ceiling subtracts the separately entered setup allowance before dividing by capacity; an already all-in quote should use zero setup allowance. A stress ceiling uses exactly 15% less generation with unchanged operating costs. Budget and sustained-payback requirements can be stricter than this NPV threshold. This is a screening threshold, not a guaranteed quote or generation outcome. Zero-module cases have neither a quote ceiling nor a recovery date.

**Payback.** First break-even is the first nonnegative month-end. Sustained break-even is the first month-end from which every remaining modeled cash balance stays nonnegative. Goal checks use **sustained** payback. Net cash flow to FiT end, 25-year net cash flow and 25-year NPV are separate outputs.

## Search and decision / 搜尋及決策

The coarse grid uses tilts 0/10/20/30/40°, azimuths 90/120/150/180/210/240/270°, and an adaptive row ceiling (6–24, constrained by geometry). It refines ±5° tilt and ±15° azimuth around the highest-generation coarse design for each module count. The UI reports actual candidates tested, physically feasible designs and designs meeting goals.

**Financial choices.** Highest NPV and fastest sustained payback are selected across all eligible evaluated candidates, not only the investment/energy Pareto frontier. The ≤10 kW choice maximises NPV across eligible small systems. Full layouts with more than 22 modules also test a 22-module subset, including when the full layout violates coverage. User-entered caps accept any whole module count. The automated search is not exhaustive over all counts, subsets, pitches or independent row positions.

Within the evaluated candidates, a Pareto point has no alternative with investment no higher and generation no lower, with at least one strict improvement. Budget, positive net cash flow/NPV and sustained-payback requirements filter financial choices first. Lowest investment and most generation are eligible-frontier endpoints. Balanced minimizes squared normalized distance to the ideal at **equal cost/energy weight**. This is a disclosed preference, not a financial or global mathematical optimum. North-facing systems, irregular roofs, exhaustive arbitrary independent row offsets, landscape modules and grouped layouts are outside the search. Users can inspect financially rejected physical designs.

Physical results cache separately from financial evaluation. Changing quote, budget, date or self-use assumptions reuses physical search. Tilt/azimuth irradiance, weather, refined searches and complete evidence runs have bounded caches. Frontend code is split into controls, scene, decision, evidence, validation, API and persistence/report modules; chart/react/vendor bundles and lazy evidence pages are separate.

## Evidence and limitations / 證據及限制

Generated `data/validation.json` contains solar benchmark checks, 25 row-shading comparisons, energy accounting, installation-refusal case, three **full-year** unobstructed reference cases and sensitivity evidence.

The full-generation comparator is pvlib ModelChain with PVWatts DC/inverter, SAPM temperature, assumed 1 m/s wind and default PVWatts losses. It uses the same capacity, orientation and weather as an unobstructed single-row RoofSun case. Temperature/loss/inverter assumptions differ, so monthly and annual differences are reported and explained. Components and weather are shared: this is **cross-model evidence, not independent real-roof measured accuracy**. No arbitrary field-accuracy threshold is claimed.

**Independent input evidence.** `data/hko_reference.json` records HKO King’s Park 2025 monthly observations, with source/table/checked date. Their integrated GHI is about 1,510 kWh/m², versus NASA POWER’s 1,556 kWh/m² at a different grid point (about +3%). The 1981–2010 and 1991–2020 normals are shown separately (about 1,304 and 1,342 kWh/m²/year). These periods/locations differ; this is not proof of a fixed weather bias or PV-yield accuracy. No automatic correction is applied. The annual HKO table is used rather than conflicting earlier December bulletin values. Same-year HKO values for 2023/2024 are explicitly absent.

**Actual meter reference.** `/api/reference-case` compares user-provided generation-meter kWh for consecutive full calendar months in the selected historical year. Inputs/configuration must represent that installation. Model energy is transparently normalised to the supplied installed kW. Source text is required, zero/invalid readings and cross-year month ranges are rejected. The UI/export label the record user-supplied and unverified; changing inputs invalidates the comparison. No real meter data has been supplied, and no field accuracy is claimed.

The on-demand analysis tests twelve one-at-a-time scenarios, three historical weather years and eight recommendation conditions. Its energy/NPV envelope is **not** a confidence interval, probability, P90 or exhaustive combined worst case. Additional cases can change rankings. Finite-row calculations, centre-point object rays, electrical block assumptions, approximate diffuse correction, single gridded location and omitted wind/structural/string/IAM/clipping physics remain limits. Real roof measurements and manufacturer/installer data are required for calibration and installation decisions.

## Verify / 驗證

```bash
python -m pytest -q
python scripts/validate.py
npm run build
```

Start the API, then run production browser checks:

```bash
ROOFSUN_TEST_URL=http://127.0.0.1:8000 npm run test:browser
```

If Chromium is unavailable:

```bash
npx playwright install chromium
```

The test suite covers known finance formulas, sustained payback, tariff cliffs, cache separation, load/exclusion/shadow effects, finite-row polygon-projection agreement, multiple weather years, decision refusal and evidence scope. Browser checks include persistence, tampered-result imports, provenance reports, invalid-area handling, rejected goals, stale evidence, bilingual navigation, charts, mobile layout and failed-request retry. See [the 3 Oct review-response record](docs/REVIEW_FIXES_2026-10-03.md) for each correction and its remaining limits. GitHub Actions runs model tests, evidence generation, production build and browser checks on `Jim's-RoofSun-HK`.

To explicitly regenerate source weather (never done at runtime):

```bash
python scripts/download_weather.py --year 2023
python scripts/download_weather.py --year 2024
python scripts/download_weather.py --year 2025
```

Do not use the illustrative preset roofs, assumed quotes or reference module as surveyed properties or commercial specifications.
