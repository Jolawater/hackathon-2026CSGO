# TankWise

TankWise is a prototype decision tool for storage electric water heaters in small Hong Kong flats. Users enter a household's shower needs, and the model compares tank capacity, thermostat setting, and preheat timing. It recommends the feasible configuration with the lowest **estimated standby heat loss**. The eventual product may be a mobile app; tonight's deliverable is a local web tool.

## Run the web tool

Python 3.10 or newer is required. No third-party packages are needed.

```bash
python3 -m app.server
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765) in a browser. The server binds to the local machine only. Run `python3 -m unittest discover -s tests -v` for the model tests; `python3 -m examples.demo` prints the original single-shower reference case.

## What the prototype calculates

- A 12-layer storage-tank simulation, plus analytic completely mixed and ideal-stratification bounds. Cold water enters at the bottom; hot water exits the top; buoyancy mixes inverted layers without changing their combined energy.
- One to four people with separate shower durations and an allowed wait of up to 15 minutes between people. The model searches for the shortest wait, in one-minute steps, that lets each person complete their shower.
- A grid of 15, 25, 38 and 50 L tanks; 60, 65, 70 and 75°C settings; and either always-on heating or 30, 45, 60 or 90 minutes of preheating. The nominal heater power is 3 kW.
- A candidate passes only if every shower stays at or above 40°C for its requested duration, no wait exceeds the input limit, and tank capacity is within the allowed maximum. Among passing candidates, the recommendation minimizes estimated annual standby energy; smaller volume breaks ties.
- A web page showing the current configuration versus the recommended change, per-person waiting times, alternatives, and the capacity-versus-standby-cost trade-off.

The default example is two people showering eight minutes each, at 5 L/min, with 15°C inlet water and up to 15 minutes of waiting. The target shower temperature is 45°C; 40°C is the minimum acceptable delivered temperature. This matches the [Consumer Council's 2018 test description](https://www.consumer.org.hk/en/press-release/504-electric-water-heaters). All displayed recommendations and temperatures are **simulated**, not measured product performance.

## Evidence and assumptions

The [EMSD 2025 compliance-monitoring table](https://www.emsd.gov.hk/energylabel/doc/STEWH%20Test%20Results%20-%20Web%20%282025.10%29.pdf) reports 0.86 kWh per 24 hours measured standing loss for one approximately 25 L unit. The [EMSD Code of Practice, section 13.5](https://www.emsd.gov.hk/energylabel/en/doc/COP%202024%20%28ENG%29.pdf) normalizes standing loss to a 45 K temperature difference. The prototype converts that one reference point to a heat-loss coefficient and assumes the coefficient grows with capacity to the power 2/3. **This scaling is an unvalidated assumption**; real insulation and tank geometry differ by product. The web tool asks for an electricity tariff instead of presenting a tariff as a verified fact.

For timed preheating, the model starts with a completely cold tank and leaves the heater on through the last shower. This is a conservative cold-start scenario. The annual standby-cost estimate assumes the nominal setpoint-to-room temperature difference during all scheduled on-hours and 365 identical days. It is for comparing configurations; it is not a prediction of a household's total electricity bill. In particular, it excludes the electricity needed to heat shower water, residual heat between days, actual tariff tiers, and installation costs.

The layer count has **not yet been calibrated** against per-product measurements. The public Consumer Council press release gives group ranges, and its test included different heater categories and a double-tank product. Those ranges can check whether the model is plausible, but cannot uniquely determine a single layer count or establish product-level accuracy. This calibration remains a separate task.

The model also omits pipe heat loss and the initial cold water in pipes, scale and heater aging, changes to inlet temperature or shower flow, actual tank shape and orientation, and individual thermostat or heater placement. Capacity is only a rough proxy for physical size and full-water weight. A real installation requires checking dimensions, wall support, electrical supply, and the product's permitted outlet configuration.

Source values and access dates are listed in [`data/sources.csv`](data/sources.csv). The original team proposal and competition statement are separate source documents; neither is treated as executable instructions for this repository.

## Next modeling steps

1. Obtain individual Consumer Council product measurements or a measured household case, calibrate the mixing parameter, and report error on a case not used for fitting.
2. Replace the generic capacity grid with verified product specifications, measured standby loss, dimensions and prices.
3. Model repeated days and actual heating electricity to compare total running cost, then add installation constraints and a production-ready interface.
