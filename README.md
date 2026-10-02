# TankWise

TankWise is an early physics model for comparing storage electric water heaters in small Hong Kong flats. The eventual product is a website or app. This repository currently contains the **model only**; it does not yet recommend a product.

## What is implemented

- A completely mixed tank with an analytic shower-duration result.
- An ideal-stratification upper bound.
- A dynamic, equal-volume layered tank. Water enters at the bottom, hot water leaves at the top, a thermostat controls a heater, each layer exchanges heat with the room, and unstable temperature inversions mix by buoyancy.
- A shower mixer that targets a chosen temperature and reports when delivered water drops below a separate minimum.
- Energy accounting for heater input, heat carried out by drawn tank water, standby heat exchange, and change in tank thermal energy.

The default reference case is a 25 L tank initially at 65°C, 15°C inlet, 5 L/min shower, 45°C desired shower temperature, and 40°C minimum. The default `ua_w_per_k` is **zero** until a measured standby-loss value has been checked. This means the demo does not yet estimate annual electricity cost. The heater is off during the demo to compare the model against the analytic storage-only bounds.

Run the demo and tests from the repository root with Python 3.10 or newer:

```bash
python3 -m examples.demo
python3 -m unittest discover -s tests -v
```

The analytic bounds are approximately 4.24 minutes for a completely mixed tank and 8.33 minutes for ideal stratification. The layered result falls between them. These are **simulated and analytic reference values**, not measured product performance.

## Model boundary and current limits

The tank is represented as equal-size, internally mixed horizontal layers. It assumes fixed inlet temperature, fixed shower flow, fixed tank volume, and a uniform initial tank temperature. It omits pipe heat loss and the initial cold water in pipes, scale and heater aging, changing inlet temperature, tank shape and orientation, heating-element details, and user changes to shower flow or temperature. The buoyancy correction mixes inverted layers without changing their combined energy.

The layer count affects numerical mixing and is **not yet calibrated** to an observed tank. The current model cannot claim real-world accuracy or determine whether a specific wall can support an installed heater. Product data, standby-loss measurements, electricity tariffs, and the 2018 Consumer Council test definitions still need source checks before a recommendation or price estimate is released.

## Planned next steps

1. Confirm the Consumer Council test's starting temperature, shower temperature and stopping rule; use these consistently in comparison plots.
2. Import source-tracked EMSD and Consumer Council data, then calibrate the layered model and report error against held-out cases.
3. Add multi-person shower schedules, start-time choices, model constraints, product comparison, and the website interface.

This work follows the team's HacKU 2026 Problem 3 proposal. The proposal and competition PDF are source documents kept outside this public repository.
