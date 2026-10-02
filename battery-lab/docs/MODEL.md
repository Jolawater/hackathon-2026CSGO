# Mathematical model and evidence / 数学模型与证据

## Energy accounting

Use hours, watts and watt-hours. `Pcharge` is grid/input-side power; `Pload` is battery-side demand.

```text
E(t+dt) = E(t) + eta * Pcharge * dt - Pload * dt
Emax = Enom * SOH * fcold
SOC = E / Emax
Etrip = distance * Wh_per_km + auxiliary_power * active_hours
Eenergy_cycle = discharged_Wh / nominal_Wh
```

The solver splits time at minute boundaries, task/window/departure events and SOC threshold crossings. Charging is capped by target SOC and a configurable two-segment taper. Energy that cannot be supplied at zero storage becomes **unserved demand**, rather than negative SOC. With a connected charger at target SOC, available input can serve the load. Efficiency losses are recorded once.

The conservation residual is `initial + grid - charging_loss - delivered - final`. A 100 Wh initial battery delivering 10 W with no charge or extra losses reaches zero after 10 hours. Two 50 Wh discharges from a 100 Wh reference represent one energy-equivalent cycle.

电量百分比不是能量单位。能量近似等于额定容量、健康度、当前可用容量系数及 SOC 的乘积。SOC 与能量的线性化省略了真实电压曲线、负载压降与 BMS 截止。

## Winter / 冬天满电为何可能不耐用

The winter sensitivity model separates three independent quantities:

1. `SOH`: permanent capacity health supplied by the user.
2. `fcold`: temporarily usable fraction in the entered cold scenario.
3. `heating_w`: additional consumption during active tasks.

Example, explicitly assumed: nominal 60 kWh, SOH 100%, `fcold=0.9`. The simplified full-charge available energy is 54 kWh, even though the UI's SOC reads 100%. A 1 kW heater over two active hours requires another 2 kWh. Warming back up does not change the permanent SOH parameter. Each run uses constant conditions; this model does not predict the transient return of inaccessible energy while temperature changes mid-trip.

These numbers are sensitivity assumptions, not a universal measured cold-weather loss curve. Ambient temperature is recorded but is not converted into cell temperature. The reference aging experiment requires an independently entered cell temperature. At 0°C, its 10–45°C cycling envelope is exceeded, so it returns no numerical aging forecast.

[US Department of Energy: Winterizing your electric vehicle](https://www.energy.gov/articles/winterizing-your-electric-vehicle) supports the relevance of cold conditions, preconditioning and cabin heating; it does not calibrate our example coefficients.

## Decisions and trade-offs

All candidates must meet task energy, minimum reserve SOC and minimum departure SOC. Only feasible candidates enter the Pareto set. Objectives are charging hours (minimize), lowest departure SOC (maximize), and grid energy cost (minimize). Dominated candidates cannot be on this frontier. Recommendation follows the chosen priority, with the explicitly implemented secondary tie-break, rather than a fabricated health score.

The model compares nine to twelve candidates: three scheduling policies crossed with 80%, 90%, 100% and the custom target. Results use identical task schedules, initial SOC, ambient assumptions and random seed. More energy remaining at the end can cost more; that is not automatically worse efficiency. The first midnight may be inside an overnight plug-in window, so the first partial session is counted.

## Published aging model

The adapter calls `blast.models.nmc_gr_50Ah_B1_2020.NMC_Gr_50Ah_B1` from **BLAST-Lite 1.1.0**. Its coefficients and state update remain upstream. This is a commercial reference pouch cell (NMC/graphite, about 50 Ah), not an iPhone cell or a specified vehicle pack.

```text
SOH = 1 - calendar_capacity_loss - cycle_capacity_loss
```

The upstream model extracts SOC, temperature, depth, rates and equivalent full cycles, then updates cumulative loss states. It uses a nonlinear time law; the application never sums independent daily absolute losses. Its complete-cycle throughput convention is the sum of absolute SOC changes divided by two, adjusted for current SOH. Device energy-equivalent cycles and cell charge-throughput EFC are labeled separately.

### Applicability gate

- Cycling temperature: 10–45°C.
- SOC: 0–100%; profile depth: 80–100%.
- Nominal charge/discharge rate: maximum 1.75C.
- Below 25°C the application conservatively limits charge rate to 0.3C, reflecting the model's explicit warning about charging at 10°C; this is stricter than simply interpolating between temperatures.
- Repeatable daily profiles must end at the starting SOC and contain strictly increasing timestamps spanning 24 hours.
- Generated cycles must fit into one day; as health changes, fixed-energy runs are rechecked daily.
- At most 1,095 simulation days. Predictions are still model estimates, not guaranteed lifespan.

Passing these checks means only that the request is inside the selected envelope; it does not prove that every combination was independently tested. The published source describes limited experiments and conservative rates. We do not generate false confidence intervals or forecast years beyond the run. 80% capacity is a reporting threshold, not battery death or a safety limit.

### Provenance

- [BLAST-Lite project, caveats and documentation](https://github.com/NatLabRockies/BLAST-Lite).
- [B1 source and experimental limitations](https://github.com/NatLabRockies/BLAST-Lite/blob/main/blast/models/nmc_gr_50Ah_B1_2020.py). The link follows upstream main; this app executes the pinned PyPI 1.1.0 artifact recorded in the lock file and validation provenance.
- [Experimental study cited by the B1 model](https://doi.org/10.1016/j.est.2023.109042). Raw experimental trajectories are not redistributed here. No independent measured-vs-predicted error is claimed.
- [Apple iPhone 15 specifications](https://support.apple.com/en-euro/111831): a manufacturer video-playback claim, not a calibration for arbitrary mixed use, cold weather or degradation. The generic 15 Wh phone preset is an assumption.

## Validation levels

1. **Physical and numerical checks:** conservation, dimensional arithmetic, event handling, step convergence.
2. **Software reproduction:** the adapter matches direct upstream calls on the same input.
3. **Experimental basis:** the reused model cites published cell aging experiments.
4. **Independent target-device validation:** not completed. No invented brand-specific accuracy, personal lifetime forecast or measured curve is shown.

Future device calibration requires time-aligned charging current/voltage, battery temperature, load, and periodic capacity checks under a reference protocol. Validation should hold out cells or conditions, not adjacent points from the same trajectory. Short-term energy measurements cannot establish years of aging accuracy.
