"""A finite-volume model of one domestic storage electric water heater.

Temperatures are in Celsius, volumes in litres, and energies in joules. Each
equal-volume layer is internally mixed. This is a decision model, not a safety
or installation assessment.
"""

from dataclasses import dataclass
from math import isfinite, log


WATER_J_PER_L_K = 4186.0  # Density approximated as 1 kg/L.


@dataclass(frozen=True)
class TankConfig:
    volume_l: float = 25.0
    power_w: float = 3000.0
    setpoint_c: float = 65.0
    inlet_c: float = 15.0
    ambient_c: float = 25.0
    shower_flow_l_min: float = 5.0
    target_c: float = 45.0
    minimum_c: float = 40.0
    ua_w_per_k: float = 0.0  # Measured standby loss is needed to set this.
    layers: int = 12
    heater_layer: int = 0  # Index 0 is the bottom layer.
    sensor_layer: int = 0
    hysteresis_c: float = 3.0

    def __post_init__(self) -> None:
        numeric = (
            self.volume_l, self.power_w, self.setpoint_c, self.inlet_c,
            self.ambient_c, self.shower_flow_l_min, self.target_c,
            self.minimum_c, self.ua_w_per_k, self.hysteresis_c,
        )
        if not all(isfinite(x) for x in numeric):
            raise ValueError("All numeric parameters must be finite")
        if self.volume_l <= 0 or self.shower_flow_l_min <= 0:
            raise ValueError("Volume and shower flow must be positive")
        if self.power_w < 0 or self.ua_w_per_k < 0 or self.hysteresis_c < 0:
            raise ValueError("Power, UA and hysteresis cannot be negative")
        if not isinstance(self.layers, int) or isinstance(self.layers, bool) or self.layers < 1:
            raise ValueError("layers must be a positive integer")
        if not 0 <= self.heater_layer < self.layers:
            raise ValueError("heater_layer must refer to an existing layer")
        if not 0 <= self.sensor_layer < self.layers:
            raise ValueError("sensor_layer must refer to an existing layer")
        if not self.inlet_c < self.minimum_c <= self.target_c < self.setpoint_c:
            raise ValueError("Require inlet < minimum <= target < setpoint")


@dataclass(frozen=True)
class ShowerResult:
    delivery_minutes: float
    times_min: tuple[float, ...]
    delivered_c: tuple[float, ...]
    layer_temperatures_c: tuple[tuple[float, ...], ...]
    heater_kwh: float
    standby_kwh: float
    draw_kwh: float
    stored_energy_change_kwh: float

    @property
    def energy_residual_kwh(self) -> float:
        """Heater input minus draw, standby and tank storage change."""
        return self.heater_kwh - self.draw_kwh - self.standby_kwh - self.stored_energy_change_kwh


def hot_draw_l_min(tank_top_c: float, config: TankConfig) -> float:
    """Hot-water draw needed to reach the desired shower temperature.

    Below target, the tap is fully hot and the delivered shower is cooler.
    """
    if tank_top_c <= config.target_c:
        return config.shower_flow_l_min
    fraction = (config.target_c - config.inlet_c) / (tank_top_c - config.inlet_c)
    return config.shower_flow_l_min * fraction


def mixed_delivery_minutes(config: TankConfig) -> float:
    """Exact mixed-tank shower duration, with heater and standby off.

    Above target, the tank cools linearly because mixing holds shower water at
    target. Below target, it cools exponentially as the tap draws fully hot.
    """
    linear = config.volume_l * (config.setpoint_c - config.target_c) / (
        config.shower_flow_l_min * (config.target_c - config.inlet_c)
    )
    if config.minimum_c == config.target_c:
        return linear
    exponential = config.volume_l / config.shower_flow_l_min * log(
        (config.target_c - config.inlet_c) /
        (config.minimum_c - config.inlet_c)
    )
    return linear + exponential


def plug_delivery_minutes(config: TankConfig) -> float:
    """Ideal stratification limit with heater and standby off."""
    return config.volume_l / hot_draw_l_min(config.setpoint_c, config)


class TankSimulator:
    def __init__(self, config: TankConfig, initial_c: float | None = None):
        self.config = config
        start = config.setpoint_c if initial_c is None else initial_c
        if not isfinite(start):
            raise ValueError("Initial temperature must be finite")
        self.temperatures_c = [float(start)] * config.layers
        self.heater_on = start < config.setpoint_c
        self.heater_j = 0.0
        self.standby_j = 0.0
        self.draw_j = 0.0
        self.initial_stored_j = self._stored_j()

    def _stored_j(self) -> float:
        per_layer_l = self.config.volume_l / self.config.layers
        return WATER_J_PER_L_K * per_layer_l * sum(self.temperatures_c)

    def delivered_temperature_c(self) -> float:
        """Current outlet temperature after cold-water blending at the tap."""
        c = self.config
        hot_flow = hot_draw_l_min(self.temperatures_c[-1], c)
        return (
            hot_flow * self.temperatures_c[-1]
            + (c.shower_flow_l_min - hot_flow) * c.inlet_c
        ) / c.shower_flow_l_min

    def _update_thermostat(self, enabled: bool) -> None:
        if not enabled:
            self.heater_on = False
            return
        sensed = self.temperatures_c[self.config.sensor_layer]
        if sensed >= self.config.setpoint_c:
            self.heater_on = False
        elif sensed <= self.config.setpoint_c - self.config.hysteresis_c:
            self.heater_on = True

    def _remove_inversions(self) -> None:
        # Pool adjacent unstable blocks in linear time. Every block's sum is
        # preserved, so this correction does not create or destroy heat.
        blocks: list[tuple[float, int]] = []
        for temperature in self.temperatures_c:
            blocks.append((temperature, 1))
            while len(blocks) >= 2 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
                upper_sum, upper_count = blocks.pop()
                lower_sum, lower_count = blocks.pop()
                blocks.append((lower_sum + upper_sum, lower_count + upper_count))
        self.temperatures_c = [
            total / count for total, count in blocks for _ in range(count)
        ]

    def step(self, dt_s: float, shower_on: bool, heater_enabled: bool) -> float:
        """Advance one time step and return the pre-step delivered temperature."""
        c = self.config
        if not isfinite(dt_s) or dt_s <= 0:
            raise ValueError("Time step must be positive and finite")
        q_l_min = hot_draw_l_min(self.temperatures_c[-1], c) if shower_on else 0.0
        drawn_l = q_l_min * dt_s / 60.0
        per_layer_l = c.volume_l / c.layers
        if drawn_l > per_layer_l + 1e-12:
            raise ValueError("Time step violates the one-layer Courant limit")

        top_c = self.temperatures_c[-1]
        delivered_c = (
            (q_l_min * top_c + (c.shower_flow_l_min - q_l_min) * c.inlet_c)
            / c.shower_flow_l_min if shower_on else top_c
        )
        self._update_thermostat(heater_enabled)

        # Use pre-step temperatures for all energy flows and layer transfers.
        old = self.temperatures_c.copy()
        heater_j = c.power_w * dt_s if self.heater_on else 0.0
        standby_j = sum(c.ua_w_per_k / c.layers * (t - c.ambient_c) * dt_s for t in old)
        draw_j = drawn_l * WATER_J_PER_L_K * (old[-1] - c.inlet_c)
        fraction = drawn_l / per_layer_l

        for i, temperature in enumerate(old):
            incoming_c = c.inlet_c if i == 0 else old[i - 1]
            transfer_c = fraction * (incoming_c - temperature)
            loss_c = c.ua_w_per_k / c.layers * (temperature - c.ambient_c) * dt_s / (
                WATER_J_PER_L_K * per_layer_l
            )
            added_c = heater_j / (WATER_J_PER_L_K * per_layer_l) if i == c.heater_layer else 0.0
            self.temperatures_c[i] = temperature + transfer_c - loss_c + added_c
        self._remove_inversions()

        self.heater_j += heater_j
        self.standby_j += standby_j
        self.draw_j += draw_j
        return delivered_c

    def energy_residual_j(self) -> float:
        return self.heater_j - self.draw_j - self.standby_j - (
            self._stored_j() - self.initial_stored_j
        )


def simulate_shower(
    config: TankConfig,
    max_minutes: float = 30.0,
    dt_s: float = 1.0,
    heater_enabled: bool = False,
) -> ShowerResult:
    """Simulate a continuous shower until it drops below the minimum temperature.

    The initial tank is uniformly at the setpoint. `heater_enabled=False`
    isolates storage performance for comparison with analytic bounds. The
    first below-minimum sample is linearly interpolated for the reported time.
    """
    if not isfinite(max_minutes) or max_minutes <= 0:
        raise ValueError("max_minutes must be positive and finite")
    if not isfinite(dt_s) or dt_s <= 0:
        raise ValueError("dt_s must be positive and finite")
    if config.shower_flow_l_min * dt_s / 60 > config.volume_l / config.layers:
        raise ValueError("Time step violates the one-layer Courant limit")

    simulator = TankSimulator(config)
    times = [0.0]
    temperatures = [simulator.delivered_temperature_c()]
    layers = [tuple(simulator.temperatures_c)]
    t_s = 0.0
    delivery_s = max_minutes * 60.0
    while t_s < max_minutes * 60.0:
        step_s = min(dt_s, max_minutes * 60.0 - t_s)
        simulator.step(step_s, shower_on=True, heater_enabled=heater_enabled)
        t_s += step_s
        delivered = simulator.delivered_temperature_c()
        times.append(t_s / 60.0)
        temperatures.append(delivered)
        layers.append(tuple(simulator.temperatures_c))
        if delivered < config.minimum_c:
            prior_c = temperatures[-2]
            if prior_c > config.minimum_c and prior_c != delivered:
                fraction = (prior_c - config.minimum_c) / (prior_c - delivered)
                delivery_s = t_s - step_s + fraction * step_s
            else:
                delivery_s = t_s - step_s
            break

    return ShowerResult(
        delivery_minutes=delivery_s / 60.0,
        times_min=tuple(times),
        delivered_c=tuple(temperatures),
        layer_temperatures_c=tuple(layers),
        heater_kwh=simulator.heater_j / 3_600_000,
        standby_kwh=simulator.standby_j / 3_600_000,
        draw_kwh=simulator.draw_j / 3_600_000,
        stored_energy_change_kwh=(simulator._stored_j() - simulator.initial_stored_j) / 3_600_000,
    )
