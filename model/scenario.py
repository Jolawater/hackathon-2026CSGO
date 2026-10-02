"""Multi-person evening shower scenarios for the layered tank model."""

from copy import deepcopy
from dataclasses import dataclass
from math import isfinite

from .tank import TankConfig, TankSimulator


@dataclass(frozen=True)
class HouseholdNeeds:
    shower_minutes: tuple[float, ...] = (8.0, 8.0)
    max_wait_minutes: int = 15
    flow_l_min: float = 5.0
    inlet_c: float = 15.0
    ambient_c: float = 20.0
    target_c: float = 45.0
    minimum_c: float = 40.0
    max_volume_l: float = 50.0
    tariff_hkd_per_kwh: float = 1.4

    def __post_init__(self) -> None:
        if not 1 <= len(self.shower_minutes) <= 4:
            raise ValueError("Provide 1 to 4 shower durations")
        if any(not isfinite(x) or x <= 0 or x > 30 for x in self.shower_minutes):
            raise ValueError("Each shower must last between 0 and 30 minutes")
        if not isinstance(self.max_wait_minutes, int) or not 0 <= self.max_wait_minutes <= 60:
            raise ValueError("Maximum wait must be an integer from 0 to 60 minutes")
        for value in (self.flow_l_min, self.inlet_c, self.ambient_c,
                      self.target_c, self.minimum_c, self.max_volume_l,
                      self.tariff_hkd_per_kwh):
            if not isfinite(value):
                raise ValueError("Scenario values must be finite")
        if not 0 < self.flow_l_min <= 20 or self.max_volume_l <= 0:
            raise ValueError("Flow and maximum volume must be positive")
        if not self.inlet_c < self.minimum_c <= self.target_c:
            raise ValueError("Require inlet < minimum <= target")
        if self.tariff_hkd_per_kwh < 0:
            raise ValueError("Tariff cannot be negative")


@dataclass(frozen=True)
class Configuration:
    volume_l: float
    setpoint_c: float
    policy: str  # always_on or timed
    preheat_minutes: int = 0

    def __post_init__(self) -> None:
        if self.volume_l <= 0 or not 60 <= self.setpoint_c <= 75:
            raise ValueError("Configuration volume or setpoint out of range")
        if self.policy not in {"always_on", "timed"}:
            raise ValueError("Unknown heating policy")
        if self.preheat_minutes < 0 or (self.policy == "always_on" and self.preheat_minutes):
            raise ValueError("Invalid preheat duration")


@dataclass(frozen=True)
class PersonResult:
    requested_minutes: float
    wait_minutes: int
    usable_minutes: float
    minimum_delivered_c: float
    complete: bool


@dataclass(frozen=True)
class ScenarioResult:
    configuration: Configuration
    people: tuple[PersonResult, ...]
    feasible: bool
    total_wait_minutes: int
    evening_heater_kwh: float
    estimated_annual_standby_kwh: float
    estimated_annual_standby_hkd: float
    tank_ua_w_per_k: float


def estimate_ua_w_per_k(volume_l: float) -> float:
    """Illustrative UA based on one EMSD 25 L test, scaled by V^(2/3).

    EMSD's 2025 monitoring PDF lists a 25 L Berlin heater with measured
    standing loss 0.86 kWh/24 h. The Code normalizes that number to a 45 K
    tank-to-room difference. Geometry scaling is a model assumption, not a
    statement about a particular product or its insulation.
    """
    reference_ua = 0.86 * 1000.0 / (24.0 * 45.0)
    return reference_ua * (volume_l / 25.0) ** (2.0 / 3.0)


def _advance_idle(simulator: TankSimulator, minutes: float, heater_enabled: bool) -> None:
    remaining = minutes * 60.0
    while remaining > 1e-8:
        step = min(2.0 if heater_enabled else 30.0, remaining)
        simulator.step(step, shower_on=False, heater_enabled=heater_enabled)
        remaining -= step


def _simulate_person(simulator: TankSimulator, minutes: float) -> tuple[float, float, bool]:
    remaining = minutes * 60.0
    elapsed = 0.0
    first_failure_s: float | None = None
    minimum_delivered_c = float("inf")
    while remaining > 1e-8:
        step = min(2.0, remaining)
        delivered = simulator.delivered_temperature_c()
        minimum_delivered_c = min(minimum_delivered_c, delivered)
        if delivered < simulator.config.minimum_c and first_failure_s is None:
            first_failure_s = elapsed
        simulator.step(step, shower_on=True, heater_enabled=True)
        remaining -= step
        elapsed += step
    final_delivered = simulator.delivered_temperature_c()
    minimum_delivered_c = min(minimum_delivered_c, final_delivered)
    if final_delivered < simulator.config.minimum_c and first_failure_s is None:
        first_failure_s = elapsed
    usable = minutes if first_failure_s is None else first_failure_s / 60.0
    return usable, minimum_delivered_c, first_failure_s is None


def _wait_options(max_wait_minutes: int) -> tuple[int, ...]:
    return tuple(range(max_wait_minutes + 1))


def simulate_household(
    needs: HouseholdNeeds,
    configuration: Configuration,
    *,
    layers: int = 12,
) -> ScenarioResult:
    """Run one evening and choose the shortest allowed wait for each person.

    Timed heating assumes a fully cold tank at the start of preheating, a
    conservative cold-start case. Always-on starts uniformly at setpoint.
    The heater stays enabled from the first shower to the end of the last one.
    """
    if configuration.volume_l > needs.max_volume_l:
        raise ValueError("Configuration exceeds the allowed tank volume")
    config = TankConfig(
        volume_l=configuration.volume_l,
        setpoint_c=configuration.setpoint_c,
        inlet_c=needs.inlet_c,
        ambient_c=needs.ambient_c,
        shower_flow_l_min=needs.flow_l_min,
        target_c=needs.target_c,
        minimum_c=needs.minimum_c,
        ua_w_per_k=estimate_ua_w_per_k(configuration.volume_l),
        layers=layers,
    )
    initial_c = config.setpoint_c if configuration.policy == "always_on" else config.inlet_c
    simulator = TankSimulator(config, initial_c=initial_c)
    if configuration.policy == "timed":
        _advance_idle(simulator, configuration.preheat_minutes, heater_enabled=True)

    people: list[PersonResult] = []
    for person_index, requested_minutes in enumerate(needs.shower_minutes):
        waits = (0,) if person_index == 0 else _wait_options(needs.max_wait_minutes)
        last_wait = 0
        accepted: tuple[TankSimulator, PersonResult] | None = None
        fallback: tuple[TankSimulator, PersonResult] | None = None
        for wait_minutes in waits:
            trial = deepcopy(simulator)
            _advance_idle(trial, wait_minutes - last_wait, heater_enabled=True)
            simulator = trial
            last_wait = wait_minutes
            shower_trial = deepcopy(simulator)
            usable, minimum_c, complete = _simulate_person(shower_trial, requested_minutes)
            person = PersonResult(requested_minutes, wait_minutes, usable, minimum_c, complete)
            fallback = (shower_trial, person)
            if complete:
                accepted = fallback
                break
        outcome = accepted or fallback
        assert outcome is not None
        simulator, person = outcome
        people.append(person)

    total_wait = sum(person.wait_minutes for person in people)
    operating_hours = (
        24.0 if configuration.policy == "always_on" else
        (configuration.preheat_minutes + sum(needs.shower_minutes) + total_wait) / 60.0
    )
    # A transparent nominal estimate. It does not claim to reproduce a
    # household's metered annual bill or model off-period residual heat.
    annual_standby_kwh = (
        config.ua_w_per_k * (config.setpoint_c - config.ambient_c)
        * operating_hours * 365.0 / 1000.0
    )
    return ScenarioResult(
        configuration=configuration,
        people=tuple(people),
        feasible=all(person.complete for person in people),
        total_wait_minutes=total_wait,
        evening_heater_kwh=simulator.heater_j / 3_600_000.0,
        estimated_annual_standby_kwh=annual_standby_kwh,
        estimated_annual_standby_hkd=annual_standby_kwh * needs.tariff_hkd_per_kwh,
        tank_ua_w_per_k=config.ua_w_per_k,
    )
