"""Explainable configuration search for a small-flat shower scenario."""

from __future__ import annotations

from dataclasses import dataclass

from .scenario import Configuration, HouseholdNeeds, ScenarioResult, simulate_household


@dataclass(frozen=True)
class Recommendation:
    selected: ScenarioResult | None
    alternatives: tuple[ScenarioResult, ...]
    evaluated: tuple[ScenarioResult, ...]
    evaluated_count: int
    feasible_count: int
    rule: str


def recommend_configuration(
    needs: HouseholdNeeds,
    *,
    capacities_l: tuple[float, ...] = (15.0, 25.0, 38.0, 50.0),
    setpoints_c: tuple[float, ...] = (60.0, 65.0, 70.0, 75.0),
    preheat_options_min: tuple[int, ...] = (30, 45, 60, 90),
    layers: int = 12,
) -> Recommendation:
    """Select minimum estimated standby energy among feasible configurations.

    A smaller tank breaks ties. All candidates use 3 kW nominal heater power;
    this is a design assumption until tied to a specific product.
    """
    results: list[ScenarioResult] = []
    for capacity in capacities_l:
        if capacity > needs.max_volume_l:
            continue
        for setpoint in setpoints_c:
            for option in [Configuration(capacity, setpoint, "always_on")]:
                results.append(simulate_household(needs, option, layers=layers))
            for lead in preheat_options_min:
                option = Configuration(capacity, setpoint, "timed", lead)
                results.append(simulate_household(needs, option, layers=layers))
    feasible = [result for result in results if result.feasible]
    feasible.sort(key=lambda result: (
        result.estimated_annual_standby_kwh,
        result.configuration.volume_l,
        result.total_wait_minutes,
    ))
    return Recommendation(
        selected=feasible[0] if feasible else None,
        alternatives=tuple(feasible[:10]),
        evaluated=tuple(results),
        evaluated_count=len(results),
        feasible_count=len(feasible),
        rule="Meet every shower within the wait and volume limits; then minimize estimated annual standby energy, breaking ties with smaller tank volume.",
    )
