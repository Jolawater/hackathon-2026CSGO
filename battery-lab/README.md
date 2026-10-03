# Battery Choices / 电池选择实验室

Two local tools provide task planning and an interactive physical demonstration:

1. **方案权衡 / Compare** — task constraints, charging strategies, A/B curves, feasible candidates and a Pareto frontier.
2. **使用沙盒 / Sandbox** — a 3D phone workbench with plug dragging, scheduled charging, a seekable 24-hour timeline, weather and illustrative thermal viewing. A separate evidence-gated cell-aging experiment sits below it.
3. **Principles · 原理与依据** — sources, limitations and executable checks, linked in the footer rather than the top navigation.

### Chart and input controls

All numeric inputs pair a horizontal slider with an editable number box, including task times and cell experiment inputs. Both stay synchronized. Slider ranges adapt to the device; typing can extend beyond the suggested slider range, while the API still validates physical limits. Run the simulation again after changing inputs.

Charts show a reserve line for device SOC, a labeled vertical range for cell SOH, distinct solid/dashed A/B lines and end values. Hover or tap for sampled values; focus a chart and use arrow keys, Home or End for keyboard inspection. Lines connect computed samples without smoothing away thresholds. The accompanying Chinese/English explanation describes feasibility, trade-offs, final stored energy, winter effects and the distinction between charge level and capacity health.

## Start on Windows

Double-click `start.cmd`. Requires Python 3.12; the script detects the existing Codex Python runtime on this computer. First installation needs internet; all subsequent simulation runs use local assets and computation. The local server listens only on `127.0.0.1:8765`.

The script also detects the isolated environment already prepared at `E:\hackathon\battery-venv`. On a different computer, it creates `.venv` inside this folder.

Manual installation:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Open <http://127.0.0.1:8765>. Keep the terminal open. Stop with Ctrl+C. Use `start.ps1 -Port 8766` if the default port is occupied. No API keys, accounts, telemetry or CDN are required. Source links open external websites only when clicked.

## Try the demonstration

1. Select the phone preset, keep default settings and run Compare. A is the entered strategy; B is a distinct feasible strategy where available. The B selector allows any candidate, including infeasible ones, to be inspected. Recommendation remains separately marked by a star.
2. Increase the target from 90% to 100%. Observe higher departure reserve and extra charging time; do not claim all objectives improve.
3. Select the car, click the winter example and run. The example transfers Molicel P28A temperature curves (about 94.1% at 5°C) and assumes 1000 W heating. It is not a measured vehicle calibration. The result explicitly compares full-charge Wh under warm and entered conditions.
4. Switch to Sandbox, set `days=30`, run and replay. Change to 365 for a year. Daily power fluctuation is optional and seeded.
5. Run the independent 25°C B1 reference-cell experiment. Set cell temperature to 0°C or SOC limits to 20–80%: the evidence gate withholds degradation numbers.
6. Open the footer Principles link to run the mathematical and software checks.

日程和充电窗口每天重复；首日从午夜开始。起止时间相等表示没有充电窗口。午夜跨越任务需拆成两段。固定时段策略表示“充电窗口内即充”。出发策略依据可用充电窗口及分段功率估算最迟启动时间，是启发式策略；若期间持续高负载，实际结果仍可能不满足目标，必须查看约束判断。

## Inputs and outputs

All three device presets are **assumptions**. iPhone 15 source information is a separate evidence card and does not turn the generic phone preset into an iPhone-specific calibration. Vehicle distance and Wh/km generate battery-side task power only when **Apply journey energy** is clicked. Editing the timeline directly makes that timeline the energy model's source of truth.

- SOC/SOH UI values are percentages; API values are fractions.
- Energy is Wh, power W, time hours; money is HKD at the entered price.
- SOC-energy is linearized. Device SOH stays at the entered value throughout a run.
- Cold capacity is a reversible sensitivity factor, separate from permanent health. Ambient temperature alone does not change energy or aging.
- Heating is additional power during the union of active task periods. Set it to zero if your measured task load already includes heating.
- Remaining range/time is an estimate above the reserve threshold using the entered average task mix.
- All reported task failures and departure requirements are checked before recommendations.
- “Extra charge hours” is a lower bound, not a promise that the entered charging window can accommodate it.
- A short run may consume initial stored energy or leave unequal final energy. Cost comparisons must be read with departure/final SOC; this is not a lifetime cost or efficiency claim.
- Save stores the device scenario in this browser. JSON exports preserve the input for reproduction; CSV exports contain simulated traces. Aging CSV exports the reference-cell curve.
- Sandbox playback reveals the computed curve; metric cards summarize the entire selected run.

## Reference-cell aging

Pinned **BLAST-Lite 1.1.0**, `NMC_Gr_50Ah_B1`. NumPy is pinned to **2.2.6** because this release uses `np.trapz`, which newer NumPy removes. Dependency versions used for verification are captured in `requirements-lock.txt`.

One generated cycle per day: discharge, recharge, then dwell at upper SOC. Charging/discharging C-rates refer to nominal capacity. Fixed daily energy assumes near-constant voltage and therefore fixed nominal charge throughput; as capacity fades, SOC swing increases. With fixed SOC limits instead, energy delivered per cycle declines. Simulation stops if the growing SOC swing leaves the evidence envelope.

Copied device profiles must span 0–24 hours, close their cycle, and pass temperature, depth and instantaneous-rate checks. A normal shallow phone cycle will usually be rejected by this particular reference model. The app does not substitute a fabricated loss curve.

## API

Interactive schema: <http://127.0.0.1:8765/docs>.

| Endpoint | Purpose |
|---|---|
| `GET /api/catalog` | Three presets, source registry and model identity |
| `POST /api/simulate` | Validated `Scenario` → metrics, trace, daily results, failures, input snapshot |
| `POST /api/compare` | Same `Scenario` → feasible candidates, Pareto membership, recommendation |
| `POST /api/aging` | `AgingInput` → applicability status, reasons, profile, optional SOH curve |
| `GET /api/validation` | Executed reference checks and honest validation status |

`engine.py` owns energy accounting and scheduling. `aging.py` gates and calls the upstream model; it does not fit new coefficients. `catalog.py` owns presets and evidence. The frontend uses local SVG charts and sends JSON to the server. Pydantic rejects invalid values with HTTP 422. Unsupported scientific conditions are valid requests returning an explicit `unsupported` result, not zero loss.

## Development and tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
# With the server running, and Microsoft Edge installed:
.\.venv\Scripts\python.exe tests/browser_check.py
```

The browser check saves screenshots and its report in ignored `artifacts/`. The tests check behavior and physical invariants; they are not independent experimental validation. See [MODEL](docs/MODEL.md), [VALIDATION](docs/VALIDATION.md), [COMPETITION](docs/COMPETITION.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Everyday scenario presets / 生活场景

Each device offers two editable, assumed scenarios: student/travel for phones, commute/delivery for electric two-wheelers, and commute/winter for electric cars. Selecting a card replaces device inputs and clears previous device results. Changes are labeled Customized. Saved and exported JSON retains `scenario_id` and `scenario_customized`; older files import as custom configurations. The cell-aging experiment remains independent.

电单车指使用锂电池的两轮电动车；电车指纯电动汽车。场景卡解释适用人群、遇到的问题和应关注的输出；它们是待用户调研验证的演示假设。车辆预设的任务功率与每日距离、Wh/km 和辅助用电一致，冬季取暖另行计入。

`GET /api/catalog` now includes `scenarios` with stable IDs, bilingual title/audience/problem/focus and full parameters, while preserving the original `presets`. Scenario metadata is descriptive and does not change the physical model. Run `python tests/scenarios_check.py` with the local server running to check all six scenarios, state clearing, customization, saved-state restoration, bilingual switching and legacy import.

## 3D workbench and cycle-based life chart

See [WORKSHOP.md](docs/WORKSHOP.md) for controls, the thermal equations, digitized manufacturer cold curves, model boundaries and the final trade-offs. The sandbox is a generic phone prototype; electric two-wheeler and car scenarios remain in Compare. The independent life chart plots EFC versus capacity, supports daily cycle frequency, and reports milestone estimates only within the simulated duration.

Browser checks: `python tests/browser_check.py`, `python tests/scenarios_check.py`, `python tests/workshop_check.py`. Deterministic game-model checks: `node tests/workshop_model.mjs`. WebGL is required for 3D rendering; calculation and timeline controls remain usable if rendering is unavailable.

比赛主 trade-off 可导入 `examples/charge-limit-A.json`，运行后将 B 选为“窗口内即充 / 100%”。相同条件下 A 充电约 60 分钟，B 约 100 分钟，B 多留 3 Wh。完整适题核对见 [COMPETITION.md](docs/COMPETITION.md)。

## 季节、地区与浅色主题

沙盒支持 1–12 月、四季、动画/工作室风格；网站使用薄荷绿、淡紫和暖米色背景。模拟与沙盒均可应用新加坡、香港、赫尔辛基的 NASA POWER 2001–2020 月均气候参考。地区通过环境温度影响模型，不直接产生纬度损耗系数；湿度仅记录，室温仍单独填写。详见 [WORKSHOP.md](docs/WORKSHOP.md)。地区交互验收：`python tests/regions_check.py`。
