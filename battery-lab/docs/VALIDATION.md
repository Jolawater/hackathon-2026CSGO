# Validation report

Validation date: 2026-10-02. Platform: Windows, Python 3.12.14, pinned BLAST-Lite 1.1.0 and NumPy 2.2.6.

## Automated checks

Run `python -m pytest -q -p no:cacheprovider` from `battery-lab`.

Tests cover:

- 100 Wh / 10 W hand calculation and two half-capacity discharges.
- Energy conservation, normal and insufficient-power cases.
- One-minute versus 15-second time-step convergence.
- Deterministic three-device scenarios and seeded load variation.
- No charging window and zero-load behavior.
- Threshold strategy session latching.
- Departure strategy when the charging window ends before departure.
- Winter usable capacity distinct from permanent SOH, plus added heating.
- Feasibility before Pareto/recommendation.
- Aging rejection for unsupported temperature, depth, rate, cold charging and open daily cycles.
- Supported aging, monotone capacity loss and constant-energy boundary stopping.
- FastAPI input validation, scenario round-trip and evidence endpoints.

The on-screen Evidence page runs `validation.run_validation()` and reports numerical errors. It does not display hard-coded passing badges. Direct upstream-call comparison is software parity, not a fresh experimental accuracy result.

## Browser checks

With the local server running, `python tests/browser_check.py` uses headless Microsoft Edge via Playwright. It verifies all three devices, winter inputs, bilingual UI, comparison table, playback, supported/unsupported aging, profile transfer, JSON export/import, evidence results and a 390 px viewport. Console exceptions fail the check.

Screenshots and JSON reports are saved under ignored `artifacts/`. A versioned numerical/browser result snapshot and model source hashes are recorded in `validation-results.json` after the final run.

## Evidence limitations

- No independent iPhone, two-wheeler or EV-pack long-term measurement dataset has been obtained or fitted.
- The cited B1 research underpins the reused published model. Raw experimental trajectories and a new measured-vs-predicted error assessment are not included.
- Winter reference mode integrates manufacturer P28A curves and interpolates temperature; transfer to devices and the game thermal parameters remain uncalibrated. Manual assumptions remain available.
- The mathematical/reference checks satisfy a model-check demonstration; they must not be presented as proof of personal lifespan prediction accuracy.
- User interviews have not been conducted by this implementation. The interview template remains pending.

## Reproduction

Save the scenario JSON, model version, dependency lock and random seed. Run through the local API or reimport the JSON in the browser. For aging, preserve the returned `input`, including any copied SOC profile; the result also identifies the reference model and rejection reasons.

## Workshop update checks

`tests/workshop_model.mjs` checks deterministic event replay, restored minute states, cold limits and energy balance. `tests/workshop_check.py` checks real 3D plug dragging, thermal mode, time scrubbing, environment restoration, mobile/bilingual layouts and profile transfer with the evidence gate. The Python suite also covers daily cycling frequency and empirical-reference interpolation. These are implementation checks, not target-device experimental validation.

`tests/regions_check.py` verifies monthly reference application, indoor/outdoor separation, manual overrides, scenario persistence, and tropical scene behavior. Unit tests verify region metadata and derived cold factors. These checks validate data handling, not local weather accuracy.
