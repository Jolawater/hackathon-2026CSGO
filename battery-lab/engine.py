"""Deterministic battery-side energy accounting. No device aging inferred."""
from math import isfinite
from random import Random
from typing import Literal

from pydantic import BaseModel, Field, model_validator

VERSION = "energy-1.0.0"


class Task(BaseModel):
    start: float = Field(ge=0, lt=24)
    end: float = Field(gt=0, le=24)
    power_w: float = Field(ge=0, le=1_000_000)
    label: str = Field(default="Task", max_length=80)

    @model_validator(mode="after")
    def order(self):
        if self.end <= self.start:
            raise ValueError("Task end must follow start; split overnight tasks.")
        return self


class Scenario(BaseModel):
    device: Literal["phone", "scooter", "car"] = "phone"
    capacity_wh: float = Field(default=15, gt=0, le=1_000_000)
    soh: float = Field(default=1, gt=0, le=1)
    initial_soc: float = Field(default=.8, ge=0, le=1)
    reserve: float = Field(default=.1, ge=0, lt=1)
    trigger: float = Field(default=.2, ge=0, lt=1)
    target: float = Field(default=.9, gt=0, le=1)
    charge_w: float = Field(default=10, ge=0, le=500_000)
    efficiency: float = Field(default=.9, gt=0, le=1)
    taper_soc: float = Field(default=.8, gt=0, le=1)
    taper_factor: float = Field(default=.5, gt=0, le=1)
    window_start: float = Field(default=22, ge=0, lt=24)
    window_end: float = Field(default=7, ge=0, lt=24)
    departure: float = Field(default=8, ge=0, lt=24)
    departure_min: float = Field(default=.7, ge=0, le=1)
    price: float = Field(default=1.2, ge=0, le=100)
    days: int = Field(default=1, ge=1, le=365)
    strategy: Literal["fixed", "threshold", "departure"] = "fixed"
    priority: Literal["interruptions", "reserve", "cost"] = "interruptions"
    tasks: list[Task] = Field(default_factory=list, max_length=24)
    ambient_c: float = Field(default=25, ge=-40, le=60)
    fluctuation: float = Field(default=0, ge=0, le=.5)
    seed: int = 42
    # Optional journey metadata; tasks are the canonical battery-side loads.
    distance_km: float = Field(default=0, ge=0, le=2000)
    wh_km: float = Field(default=0, ge=0, le=1000)
    aux_w: float = Field(default=0, ge=0, le=10000)
    cold_capacity_factor: float = Field(default=1, gt=0, le=1)
    heating_w: float = Field(default=0, ge=0, le=20000)

    @model_validator(mode="after")
    def validate_limits(self):
        if self.trigger >= self.target:
            raise ValueError("Charge trigger must be lower than target.")
        return self


def in_window(hour, start, end):
    # Equal endpoints explicitly mean no charging opportunity.
    return start <= hour < end if start < end else (hour >= start or hour < end) if start > end else False


def charge_hours(energy, capacity, s):
    rate = s.charge_w * s.efficiency
    if rate <= 0:
        return float("inf")
    cutoff, goal = capacity * s.taper_soc, capacity * s.target
    return max(0, min(goal, cutoff) - energy) / rate + max(0, goal - max(energy, cutoff)) / (rate * s.taper_factor)


def remaining_charge_window(hour, s):
    """Available plug-in hours before the next departure, including overnight windows."""
    deadline = hour + ((s.departure - hour) % 24)
    edges = sorted(set([hour, deadline] + [d * 24 + h for d in range(3) for h in [0, s.window_start, s.window_end, 24] if hour < d * 24 + h < deadline]))
    return sum(b-a for a,b in zip(edges,edges[1:]) if in_window(((a+b)/2)%24,s.window_start,s.window_end))


def simulate(s: Scenario, step_minutes=1, include_trace=True):
    cap = s.capacity_wh * s.soh * s.cold_capacity_factor
    energy = cap * s.initial_soc
    initial = energy
    grid = delivered = loss = unmet = charge_time = high_soc = heating_demand = 0.0
    min_soc = s.initial_soc
    sessions = 0
    was_charging = False
    latched = False
    dep_socs, failures, trace, daily = [], [], [], []
    if include_trace:
        trace.append({"hour": 0, "soc": s.initial_soc, "load_w": 0, "ambient_c": s.ambient_c})
    rng = Random(s.seed)
    modifiers = [1 + rng.uniform(-s.fluctuation, s.fluctuation) for _ in range(s.days)]
    end = s.days * 24.0
    # Exact task, window and departure boundaries plus numerical integration steps.
    boundaries = {0.0, end}
    for day in range(s.days):
        for hour in [s.window_start, s.window_end, s.departure, 0, 24] + [x for t in s.tasks for x in (t.start, t.end)]:
            boundaries.add(day * 24.0 + hour)
    count = int(round(end * 60 / step_minutes))
    boundaries.update(min(end, i * step_minutes / 60) for i in range(count + 1))
    points = sorted(boundaries)
    next_sample = 0.0
    sample_step = max(1 / 60, end / 2200)
    day_unmet = 0.0
    for start, stop in zip(points, points[1:]):
        day = min(int(start / 24), s.days - 1)
        hour = start - day * 24
        if abs(hour - s.departure) < 1e-8:
            dep_socs.append(energy / cap)
        active = [t for t in s.tasks if t.start <= hour + 1e-9 < t.end - 1e-9]
        load = sum(t.power_w for t in active) * modifiers[day] + (s.heating_w if active else 0)
        dt_remaining = stop - start
        elapsed = 0.0
        # Split at SOC thresholds so charge sessions and taper crossings are not rounded to minutes.
        while dt_remaining > 1e-10:
            soc = energy / cap
            available = in_window(hour, s.window_start, s.window_end) and s.charge_w > 0
            if soc <= s.trigger + 1e-9:
                latched = True
            if soc >= s.target - 1e-9:
                latched = False
            if s.strategy == "threshold":
                wants = latched
            elif s.strategy == "departure":
                available_hours = remaining_charge_window(hour + elapsed, s)
                wants = charge_hours(energy, cap, s) >= available_hours - step_minutes / 60
            else:
                wants = True
            rate = s.charge_w * (s.taper_factor if soc >= s.taper_soc - 1e-9 else 1)
            input_w = rate if available and wants and energy < cap * s.target - 1e-9 else 0.0
            # At target, a connected charger can supply the load without chattering.
            if available and wants and energy >= cap * s.target - 1e-9 and load:
                input_w = min(rate, load / s.efficiency)
            net = input_w * s.efficiency - load
            dt = dt_remaining
            hit_level = None
            for level in [0, cap * s.trigger, cap * s.taper_soc, cap * s.target, cap]:
                if abs(net) > 1e-12:
                    crossing = (level - energy) / net
                    if 0 < crossing < dt:
                        dt = crossing
                        hit_level = level
            entering = input_w > 1e-9
            if entering and not was_charging:
                sessions += 1
            was_charging = entering
            raw = hit_level if hit_level is not None else energy + net * dt
            missing = max(0.0, -raw)
            new_energy = max(0.0, min(cap, raw))
            grid += input_w * dt
            loss += input_w * (1 - s.efficiency) * dt
            delivered += load * dt - missing
            unmet += missing
            day_unmet += missing
            if missing > 1e-8 and (not failures or failures[-1]["day"] != day + 1):
                failures.append({"day": day + 1, "hour": round(hour + elapsed, 4), "tasks": [t.label for t in active]})
            charge_time += dt if entering else 0
            high_soc += dt if soc >= .9 - 1e-9 else 0
            heating_demand += s.heating_w * dt if active else 0
            energy = new_energy
            min_soc = min(min_soc, energy / cap)
            dt_remaining -= dt
            elapsed += dt
        if include_trace and (start >= next_sample or stop == end):
            trace.append({"hour": round(stop, 5), "soc": round(energy / cap, 7), "load_w": round(load, 4), "ambient_c": s.ambient_c})
            next_sample = start + sample_step
        if abs(stop / 24 - round(stop / 24)) < 1e-8:
            daily.append({"day": int(round(stop / 24)), "soc": energy / cap, "unmet_wh": day_unmet})
            day_unmet = 0
    balance = initial + grid - loss - delivered - energy
    departure_min = min(dep_socs) if dep_socs else s.initial_soc
    feasible = unmet < 1e-7 and min_soc + 1e-7 >= s.reserve and departure_min + 1e-7 >= s.departure_min
    task_hours = sum(t.end-t.start for t in s.tasks)
    daily_demand = sum((t.end-t.start)*t.power_w for t in s.tasks) + heating_demand/s.days
    avg_load = daily_demand / max(1e-9, task_hours)
    deficit = max(unmet, max(0, s.reserve - min_soc) * cap, max(0, s.departure_min - departure_min) * cap)
    metrics = dict(feasible=feasible, min_soc=min_soc, final_soc=energy / cap, departure_soc=departure_min,
                   sessions=sessions, charge_hours=charge_time, grid_wh=grid, cost=grid / 1000 * s.price,
                   delivered_wh=delivered, unmet_wh=unmet, energy_cycles=delivered / s.capacity_wh,
                   high_soc_hours=high_soc, balance_error_wh=balance,
                   reserve_runtime_hours=max(0, energy - s.reserve * cap) / avg_load if avg_load else None,
                   extra_charge_hours_lower_bound=deficit / (s.charge_w * s.efficiency) if s.charge_w else None,
                   energy_deficit_wh=deficit, full_usable_wh=cap, warm_full_wh=s.capacity_wh*s.soh,
                   heating_demand_wh=heating_demand,
                   remaining_km=max(0,energy-s.reserve*cap)*s.distance_km/daily_demand if s.distance_km and daily_demand else None)
    assert all(isfinite(v) for v in metrics.values() if isinstance(v, float))
    return {"model": VERSION, "input": s.model_dump(), "metrics": metrics, "trace": trace,
            "daily": daily, "failures": failures, "evidence": "assumed_parameters_energy_balance",
            "limitations": ["Linear SOC-energy approximation", "SOH held at user input; no device degradation prediction", "Ambient temperature not converted to cell temperature", "Cold capacity factor and heating power are user assumptions, not a temperature calibration", "Charging taper is an assumption"]}


def compare(s):
    candidates = []
    for strategy in ["fixed", "threshold", "departure"]:
        for target in sorted(set([.8, .9, 1.0, s.target])):
            if target <= s.trigger:
                continue
            config = s.model_copy(update={"strategy": strategy, "target": target})
            result = simulate(config, include_trace=False)
            candidates.append({"id": f"{strategy}-{target:.2f}", "strategy": strategy, "target": target, "metrics": result["metrics"]})
    feasible = [c for c in candidates if c["metrics"]["feasible"]]
    def objectives(c):
        m = c["metrics"]
        return m["charge_hours"], -m["departure_soc"], m["cost"]
    for c in candidates:
        a = objectives(c)
        c["pareto"] = c in feasible and not any(all(x <= y + 1e-9 for x, y in zip(objectives(d), a)) and any(x < y - 1e-9 for x, y in zip(objectives(d), a)) for d in feasible if d is not c)
    keys = {"interruptions": lambda c: (c["metrics"]["sessions"], c["metrics"]["charge_hours"]),
            "reserve": lambda c: (-c["metrics"]["departure_soc"], c["metrics"]["cost"]),
            "cost": lambda c: (c["metrics"]["cost"], -c["metrics"]["departure_soc"])}
    winner = min(feasible, key=keys[s.priority]) if feasible else None
    return {"input": s.model_dump(), "candidates": candidates, "recommended": winner["id"] if winner else None,
            "priority": s.priority, "model": VERSION}
