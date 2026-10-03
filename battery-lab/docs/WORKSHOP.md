# 3D battery workshop / 桌面电池沙盒

## What to try

1. Open the Sandbox tab. The first 3D prototype is a **generic 15 Wh phone**, not a measured iPhone replica. The comparison page still supports phones, electric two-wheelers and electric cars through six editable scenarios.
2. Drag the green plug into the bottom port, or use Connect. Drag the background to rotate the phone; Rotate also provides a button alternative. Select a black studio or a room with a window and furniture.
3. Set an activity, target charge, charger power and optional daily charging window. Range sliders and number fields stay synchronized.
4. Play at 60×, 600× or 3600×, skip an hour, or drag anywhere along the full 24-hour timeline. The energy chart previews the complete day; the cursor selects the inspected minute. The controls and environment restore to that minute too.
5. To change the afternoon, seek to that time and edit the controls. Changes are timestamped; editing an earlier point replaces later events. Reset returns to the initial day's setup. Changing the experiment start clock restarts at minute zero.
6. Choose a month (1–12) or Spring/Summer/Autumn/Winter. The northern-hemisphere scene changes foliage and particles; it does not assume actual local weather or change temperature. Select Outdoors to expose the phone to the entered outside air. Indoors uses room temperature instead. Relative humidity is recorded; no unvalidated humidity multiplier affects energy or aging. The window illumination follows the simulated time of day.
7. Thermal illustration uses the **estimated mean shell temperature**, on a fixed −10 to 60°C color scale. The separately displayed cell temperature comes from the two-node model. There are no calibrated local hotspots or real thermal-camera readings.
8. Read the explanation below the scene: stored versus cold-accessible energy, delivered/unmet demand, full-day feasibility, grid energy and estimated peak temperature. Export CSV for every minute, including environment and connection state.
9. Send the SOC day to the independent reference-cell life experiment. Its constant cell temperature must be selected separately; phone temperature estimates are **not** silently converted into a validated aging input. Open or shallow daily cycles can be rejected. Clear the imported profile to return to editable cycle experiments.

## What is being traded off?

**Task completion and reserve energy versus charging time, interruptions and cost** is the primary decision. Higher targets can provide reserve but require more input energy and charging time. Fewer opportunities can reduce interruptions while making unexpected use harder to cover. Winter heating trades comfort for energy. Activity power trades use experience for runtime.

The independent reference-cell experiment adds **capacity retention versus cycling conditions and time**. Its graph uses equivalent full cycles (EFC), with an explanatory sentence and a 100/300/500/800/1000 EFC table. Values inside the simulated run are interpolated; unreached milestones are explicitly not extrapolated. Calendar aging is included, so cycle count alone is insufficient to determine SOH. Daily frequency is an experimental input only when no imported SOC profile supplies the actual sequence. Two discharges of 50% correspond approximately to one full equivalent cycle, not two.

## Thermal and cold model

The one-second integration step conserves energy:

`stored change = grid input − charger losses − delivered load − internal I²R loss`.

The cell and shell exchange heat, and the shell cools to the selected air temperature. Assumed parameters are listed in the in-game model drawer: 15 Wh, 3.85 V, 0.12 Ω, 90% efficiency, heat capacities 75/100 J/K, conductances 0.6/0.25 W/K. These have not been fitted to an iPhone. The 0–45°C charging gate is an illustrative controller rule, not a manufacturer's BMS specification. The scope of this visual prototype is interaction and physical accounting, not thermal safety assessment.

Cold energy uses [Molicel P28A v1.3 manufacturer temperature-discharge curves](https://www.molicel.com/wp-content/uploads/INR18650P28A_1.3_Product-Data-Sheet-of-INR-18650-P28A-80093.pdf): charged at 23°C, CC-CV 2.8 A to 4.2 V, 50 mA termination; discharged at 2.8 A to 2.5 V. `extract_temperature_reference.py` extracts vector paths and integrates `V dAh`. It saves the PDF SHA-256, all digitized points, conditions and method in `static/data/p28a-temperature.json`. The PDF itself is not redistributed. Reproduction requires pdfplumber and that specific PDF revision.

| Temperature | Integrated discharge energy | Relative to 23°C |
|---|---:|---:|
| −40°C | 6.80 Wh | 69.1% |
| −30°C | 7.79 Wh | 79.2% |
| −20°C | 8.32 Wh | 84.4% |
| 0°C | 9.11 Wh | 92.5% |
| 23°C | 9.85 Wh | 100% |
| 45°C | 10.25 Wh | 104.1% |
| 60°C | 10.23 Wh | 103.9% |

These are approximate integrations of manufacturer typical curves, **not raw independent measurements**. Linear interpolation connects temperature points, without extrapolation. In the application's cold-reduction mode, ratios above 100% are capped at 100%. The 5°C winter preset consequently uses about 94.1%, replacing the arbitrary 90% default. This remains a **reference-cell transfer**, not a calibrated EV pack or phone prediction. The plotted protocol's integrated energy need not equal the nominal datasheet energy under another protocol.

In the 3D demonstration, inaccessible energy is `max(0, nominal energy × (1 − reference fraction))`; accessible energy is `max(0, stored energy − inaccessible energy)`. Cooling does not delete stored energy and warming can release the temporarily inaccessible part. This dynamic mapping is a simplifying assumption, not a measured transient model. The source's constant 2.8 A test does not calibrate the game's variable load. Out-of-range reference ratios are marked unavailable; no unsupported lifespan result is generated.

In comparison mode, reference mode assumes the cell has equilibrated to ambient air and scales full usable energy at that fixed condition. Manual mode remains available for user measurements and older JSON scenes. Heating power remains an editable assumption. Neither approach changes permanent SOH.

## Verification and remaining work

- Python checks cover reference interpolation, legacy manual mode, doubled daily cycling, and the existing energy/aging suite.
- The Node check covers deterministic replay, minute snapshots, energy conservation, cold cutoff and temperature bounds.
- Edge browser checks exercise actual 3D plug dragging, seeking back and forward, restored environment, thermal mode, mobile layout, bilingual content, CSV/profile controls and the aging applicability gate.
- Three.js 0.170.0 is bundled locally under MIT. No CDN or external API is needed at runtime after installing Python dependencies.
- No independent phone temperature, pack cold performance or long-term target-device aging validation has been performed. Real user interviews remain pending. No humidity, condensation, plating, spatial thermal field or thermal-runaway model is implied.

## Visual update

The default Animated style uses toon-shaded geometry, seasonal foliage and a pastel control desk. Studio restores darker materials. Room and Black backgrounds remain selectable independently. Month and season are linked (December–February winter, March–May spring, June–August summer, September–November autumn), with no inferred weather forecast, degradation multiplier or implicit temperature change. They are stored in timeline snapshots and exported CSV. The site canvas uses mint, lavender and warm cream rather than white-only panels.

## Regional comparison / 地区与纬度

Compare and Sandbox now offer **Singapore (1.35°N), Hong Kong (22.30°N), and Helsinki (60.17°N)**. The bundled NASA POWER / MERRA-2 reference provides 2001–2020 monthly mean air temperature and relative humidity at 2 m. These are gridded reanalysis-derived conditions near the selected coordinates, not station observations, a current forecast, extremes, or battery measurements. Each region preserves the exact API URL, response hash, returned period and units in `static/data/regional-climate.json`; `fetch_climate_reference.py` reproduces retrieval. [Official API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/).

| January reference | Air temperature | Relative humidity |
|---|---:|---:|
| Singapore | 25.94°C | 87.99% |
| Hong Kong | 16.00°C | 73.58% |
| Helsinki | −2.92°C | 92.82% |

Use **Apply monthly reference** explicitly. In Sandbox, this fills outside temperature and humidity; room temperature stays separate. While reference mode is active, changing month updates the monthly values. Editing outside temperature or humidity makes the environment custom and stops automatic replacement. The same-month comparison drawer shows all three regions. Timeline replay restores region, month and application state, and CSV includes them.

In Compare, Apply fills ambient temperature, records humidity and enables the P28A reference cold mode; thermal equilibrium with the entered air is an explicit simplifying assumption. Region/month/reference status survives scenario JSON round-trips. Editing ambient temperature disengages the climate reference; the cell reference curve can still evaluate that manually entered temperature.

Latitude itself never multiplies battery aging or energy. Climate enters through temperature, and device temperature still depends on indoor/outdoor placement and the illustrative thermal model. Humidity remains a record only. Singapore uses a tropical green scene instead of snowfall or four temperate seasons. Trees, particles and day/night lighting are illustrations, not phenology or location-specific sunrise predictions. HVAC needs, sun exposure, wind, terrain and regional travel habits are not inferred.

Competition relevance: regions provide understandable alternative conditions and real reference inputs. They do not replace the central charge-time versus reserve trade-off or establish measured target-device accuracy.
