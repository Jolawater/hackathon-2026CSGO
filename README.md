# RoofSun HK ☀️ 裝板之前，先試一次

**Test your roof before you buy the panels.**

RoofSun HK is a bilingual (繁體中文 / English) web tool for Hong Kong village-house owners. It answers three questions before anyone calls an installer:

- Is rooftop solar worth it on *my* roof?
- When will it pay back?
- What is the highest quote I should accept?

Built for **HacKU 2026 · Deep Tech · Problem Statement 3, “Test the Change Before You Make It”**.

| | |
|---|---|
| 🌐 Live demo | https://reports-sofa-directory-layer.trycloudflare.com |
| 📁 Source code | [`roofsun/`](roofsun/) (frontend, backend, data, tests) |

---

## 中文簡介

香港村屋業主想裝太陽能板，最常問三件事：值不值得裝、幾時回本、安裝商的報價貴不貴。

RoofSun HK 只問 **7 條屋主憑常識就答得出的問題**：
- 天台尺寸；
- 正門方向；
- 鄰屋高度及距離；
- 每千瓦報價；
- 其他費用檔位；
- 完工月份；
- 2033 年後會不會自用。

它用一整年的逐小時天氣，模擬日照、前後排互相遮擋、鄰屋遮擋，以及上網電價（FiT）收入。結果會給出：
- **值得裝／勉強／不建議**的結論；
- 建議排布；
- 持續回本時間；
- 最高可接受報價；
- 「再加一排」的取捨。

結果屬模擬，並非工程設計、報價或財務建議。

---

## How it meets Problem Statement 3

| Requirement | RoofSun HK |
|---|---|
| **One small system** | One flat village-house rooftop PV system (≈ 2–10 kW) |
| **≥ 2 adjustable inputs** | 7 owner inputs: roof length/width (≤ 10 m per side), front-door direction, up to 3 taller neighbours (compass direction, floors above the roof, distance), quote per kW, other-cost band, completion month, post-2033 self-use |
| **≥ 1 practical constraint** | EMSD rule: panels (including gaps) may cover **at most half** of the roof. Also a 150 kg/m² average load check, a ≥ 2 kW minimum system and the 65.03 m² village-house scope warning |
| **Trade-off between two outcomes** | **“One more row”**: more kWh, but higher cost and more row-to-row shading, so payback and NPV can get better *or* worse. The card shows Δ generation, Δ cost, Δ payback (months), shading loss and kWh per kW |
| **Evidence** | HKO measured irradiance calibration, NREL SPA reference check, row-shadow comparisons, pvlib ModelChain cross-checks, three-point NPV range and nine one-at-a-time sensitivity cases (see below) |

---

## How it works

```
7 owner answers ──► map to model inputs ──► search layouts ──► hourly simulation (8,760 h) ──► monthly cash flow ──► verdict
                    (fixed, documented       (tilt, azimuth,     pvlib SPA sun position,        FiT tiers to 2033-12-31,
                     assumptions)             rows, spacing)      Erbs + isotropic sky,          25-year horizon,
                                                                  finite-row + neighbour shade,  NPV / sustained payback /
                                                                  Martinez bypass-diode loss,    max acceptable quote
                                                                  NOCT temperature
```

1. **Weather.** We use NASA POWER hourly data (2023–2025), scaled each year to match **Hong Kong Observatory measured global solar radiation** at King's Park. The calibration ratio is computed by `roofsun/scripts/hko_check.py` and is never hard-coded.

   | Year | HKO measured (kWh/m²) | NASA POWER (kWh/m²) | Ratio |
   |---|---|---|---|
   | 2023 | 1,418.7 | 1,533.3 | 0.925 |
   | 2024 | 1,390.3 | 1,470.3 | 0.946 |
   | 2025 | 1,510.2 | 1,555.6 | 0.971 |
   | Combined | | | 0.947 |

2. **Layout search.** The search tries panel tilt, azimuth, row count and compact/spread spacing. It keeps only layouts that pass the coverage, spacing and load checks, then picks the highest-NPV feasible system of at least 2 kW.

3. **Shading.**
   - Adjacent rows use a finite-row overlap model with Martinez bypass-diode loss (3 blocks per module).
   - Each taller neighbour (up to 3, any of 8 compass directions) becomes a constant-height facade spanning 60° either side of its direction, at 3 m per floor. The 12-sector horizon takes the highest angle in each sector. It blocks direct sunlight and reduces sky-diffuse light through a sky-view factor.
   - Hong Kong (22.3°N) is south of the Tropic of Cancer, so the summer sun also passes to the north. For one neighbour 2 floors higher and 6 m away, the simulated annual loss is 13.5% to the south, 11.4% to the east, 11.8% to the west and 7.5% to the north (default roof, fixed 2-row layout).

4. **Money.**
   - Monthly cash flow over 25 years, using EMSD FiT tiers (≤ 10 kW: HK$4/kWh; 10–200 kW: HK$3/kWh) until **2033-12-31**.
   - Two scenarios:
     - **A, conservative:** the system stops earning after the FiT ends.
     - **B, self-use:** 50% self-use at HK$1.4/kWh after 2033.
   - The verdict uses three NPV points on the same configuration:
     - **值得裝 (worthwhile):** all three NPVs are positive;
     - **勉強 (marginal):** some are positive;
     - **不建議 (not recommended):** none are positive.

### Example output (default inputs, v3.1.0)

Inputs: 8.06 m × 8.06 m roof, door facing north, no taller neighbour, HK$25,000/kW quote, medium other costs, completed 2027-01.

| Result | Value |
|---|---|
| Verdict | 勉強 (marginal) |
| Suggested layout | 2 rows · 12 modules · 5.4 kW |
| First-year generation | 6,660 kWh (simulated) |
| Sustained payback | 5.41 years, around 2032-05 (simulated) |
| Highest acceptable quote | HK$28,389 per kW, where NPV = 0 in the current scenario (simulated) |

The default dimensions and prices are illustrative assumptions, not a real house or a market quotation.

---

## Run locally

Requirements: **Python 3.12+** and **Node.js 22+**. Run everything from `roofsun/`:

```bash
cd roofsun
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
npm ci
python scripts/hko_check.py      # recompute HKO calibration from the bundled CSV
npm run build
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Then open **http://127.0.0.1:8000/**. Weather data, calibration and fonts are bundled, so after setup the app needs no external API, account or internet connection.

For development, add `--reload` to uvicorn and run `npm run dev` in a second terminal. Port 5173 proxies `/api` to port 8000.

### Tests

```bash
python -m pytest -q              # model, finance, mapping and API regression tests
python scripts/validate.py       # reference checks (NREL SPA, row shadows, pvlib ModelChain)
npm run test:browser             # Playwright end-to-end checks (API must be running)
```

GitHub Actions runs the same checks (`.github/workflows/roofsun-checks.yml`).

---

## Repository layout

```
.
├── README.md                  ← you are here
├── .github/workflows/         CI: pytest, validation, build, browser tests
├── render.yaml                Render blueprint (Docker web service)
└── roofsun/
    ├── README.md              detailed model documentation (bilingual)
    ├── backend/               FastAPI app and model
    │   ├── model.py           solar position, irradiance, layout, shading, energy
    │   ├── finance.py         FiT tiers, monthly cash flow, NPV, payback
    │   ├── decision.py        layout search and recommendation
    │   ├── screening.py       7 owner inputs → model inputs, verdict, sensitivity
    │   ├── calibration.py     HKO / NASA calibration
    │   └── app.py             API routes; also serves the built frontend
    ├── src/                   React frontend (charts, 3D scene, inputs, evidence)
    ├── data/                  bundled weather, HKO observations, assumptions, presets
    ├── scripts/               hko_check.py, validate.py, download_weather.py, browser tests
    ├── tests/                 pytest suite
    ├── Dockerfile             production image: builds the frontend, serves it with the API
    └── docs/                  development records for earlier versions
```

---

## Assumptions and limitations

Every fixed value is listed, with its source, in the in-app **假設與來源 / Assumptions & sources** panel.

**Assumptions**, rather than measured facts:
- the generic 450 W / 22 kg module;
- 0.85 system factor;
- 3 m per floor;
- 4% discount rate;
- 0.5%/year degradation;
- the other-cost bands;
- the HK$20k/25k/30k reference quotes.

**Not modelled:**
- typhoon wind load and ballast;
- non-rectangular roofs;
- grouped or stairhood installations;
- string/MPPT detail and inverter clipping;
- future tariff changes;
- tax and financing.

**Simplifications:**
- Neighbours are simplified as constant-height facades (at most 3). The sky-view factor treats diffuse-light blocking the same in every direction, so northern losses may be overstated.
- Each roof side is limited to 10 m. Village houses are at most 65.03 m², and larger roofs make the layout search slow without changing the 9.9 kW recommendation.

**No field measurement yet.** No real rooftop meter readings have been compared with the model. The HKO comparison checks irradiance, not rooftop generation accuracy.

---

## Data sources and credits

**Data**
- **Hong Kong Observatory:** King's Park daily global solar radiation ([CSV](https://data.weather.gov.hk/weatherAPI/cis/csvfile/KP/ALL/daily_KP_GSR_ALL.csv)).
- **NASA POWER:** hourly irradiance and temperature, 2023–2025. *“These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.”*
- **EMSD:** Feed-in Tariff [introduction](https://re.emsd.gov.hk/tc_chi/fit/int/fit_int.html) and [FAQ](https://re.emsd.gov.hk/tc_chi/fit/faq/files/260710_FAQ_FIT%20%28TC%29.pdf), covering FiT rates and the coverage rule.
- **Lands Department:** [guide to New Territories exempted houses](https://www.landsd.gov.hk/tc/images/doc/Building%20NT%20Exempted%20Houses_c.pdf), for the 65.03 m² scope.

**Open-source libraries**
- **Backend:**
  - [pvlib-python](https://github.com/pvlib/pvlib-python) (BSD-3)
  - [FastAPI](https://fastapi.tiangolo.com/) (MIT)
  - [Uvicorn](https://www.uvicorn.org/) (BSD-3)
  - [NumPy](https://numpy.org/) (BSD-3)
  - [pandas](https://pandas.pydata.org/) (BSD-3)
  - [Shapely](https://github.com/shapely/shapely) (BSD-3)
- **Frontend:**
  - [React](https://react.dev/) (MIT)
  - [Vite](https://vitejs.dev/) (MIT)
  - [Recharts](https://recharts.org/) (MIT)
  - [three.js](https://threejs.org/) (MIT)
  - [Lucide](https://lucide.dev/) (ISC)
  - DM Sans and Manrope via Fontsource (SIL OFL 1.1)
- **Testing:**
  - [pytest](https://pytest.org/) (MIT)
  - [Playwright](https://playwright.dev/) (Apache-2.0)

**Model references**
- Reda & Andreas, *Solar Position Algorithm* (NREL SPA).
- Erbs, Klein & Duffie (1982), diffuse fraction correlation.
- Martinez-Moreno et al. (2010), partial-shading loss with bypass diodes.

---

## Development history

All code was written during HacKU 2026 (2–4 October 2026). The commit history is kept unedited.

- **Model, backend, frontend and tests:** developed on the team's working branches, now all part of `main`.
- **3D rooftop scene:** prototyped separately (commit `51854cf`, tag `archive/JESON-ROOFTOPJIM`), then ported into `roofsun/src/components/RoofScene3D.jsx` in commit `a05e5ad`.
- **Neighbours in every direction, landing screen, performance and layout overhaul, Docker/Render files:** cherry-picked into `main` with original authors and dates kept.
- **Earlier directions** (water heater, battery lab, NitroClock) were explored before the team settled on RoofSun HK. They are kept only as `archive/*` tags and are **not part of this submission**.

**AI tools.** As the handbook permits, parts of the code were written with AI coding assistants (OpenAI Codex and Anthropic Claude), under the team's direction and review.

---

*RoofSun HK is a preliminary screening tool. Results are simulations, not engineering design, structural or regulatory approval, or financial advice.*
