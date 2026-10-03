"""Evidence-gated adapter; coefficients remain in upstream BLAST-Lite."""
import os
from pathlib import Path
os.environ.setdefault("MPLCONFIGDIR", str(Path(__file__).parent / "artifacts" / "mpl-cache"))
import numpy as np
from pydantic import BaseModel, Field, model_validator

MODEL = "BLAST-Lite 1.1.0 / NMC_Gr_50Ah_B1"
SOURCE = "https://doi.org/10.1016/j.est.2023.109042"


class AgingInput(BaseModel):
    days: int = Field(default=365, ge=1, le=1095)
    temperature_c: float = Field(default=25, ge=-40, le=80)
    lower_soc: float = Field(default=.1, ge=0, le=1)
    upper_soc: float = Field(default=.9, ge=0, le=1)
    charge_c: float = Field(default=.3, gt=0, le=10)
    discharge_c: float = Field(default=.3, gt=0, le=10)
    cycles_per_day: int = Field(default=1, ge=1, le=12)
    constant_energy: bool = False
    profile: list[list[float]] | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def limits(self):
        if self.lower_soc >= self.upper_soc:
            raise ValueError("Lower SOC must be below upper SOC.")
        if self.profile is not None:
            if len(self.profile) < 3 or any(len(p) != 2 for p in self.profile):
                raise ValueError("Profile requires at least three [hour, SOC] points.")
            a = np.asarray(self.profile)
            if not np.isfinite(a).all() or not (np.diff(a[:, 0]) > 0).all() or a[0, 0] != 0 or abs(a[-1, 0] - 24) > 1e-6 or (a[:, 1] < 0).any() or (a[:, 1] > 1).any():
                raise ValueError("Profile must span 0–24 h, with increasing finite times and SOC in [0,1].")
        return self


def cell_class():
    from blast.models.nmc_gr_50Ah_B1_2020 import NMC_Gr_50Ah_B1
    return NMC_Gr_50Ah_B1


def make_profile(s, soh=1.0):
    if s.profile is not None:
        a = np.asarray(s.profile, dtype=float)
        t, soc = a[:, 0].copy(), a[:, 1].copy()
        if s.constant_energy:
            soc = soc.max() - (soc.max() - soc) / soh
        return t * 3600, soc
    depth = (s.upper_soc - s.lower_soc) / (soh if s.constant_energy else 1)
    low = s.upper_soc - depth
    # C-rates refer to nominal capacity, not current degraded capacity.
    discharge_h = depth * soh / s.discharge_c
    charge_h = depth * soh / s.charge_c
    period = 24 / s.cycles_per_day
    if discharge_h + charge_h > period:
        return np.array([0., 86400.]), np.array([s.upper_soc, low])
    pairs = {0.:s.upper_soc,24.:s.upper_soc}
    for i in range(s.cycles_per_day):
        offset=i*period
        pairs[offset]=s.upper_soc
        pairs[offset+discharge_h]=low
        pairs[offset+discharge_h+charge_h]=s.upper_soc
    knots=sorted(pairs)
    vals=[pairs[x] for x in knots]
    times = np.unique(np.concatenate([np.linspace(0, 24, 289), np.array(knots)]))
    return times * 3600, np.interp(times, knots, vals)


def scope_reasons(s, t, soc, soh):
    reasons = []
    if not 10 <= s.temperature_c <= 45:
        reasons.append("temperature_range")
    depth = float(soc.max() - soc.min())
    if depth < .8 - 1e-8 or depth > 1 + 1e-8:
        reasons.append("depth_range")
    if s.profile is not None:
        from blast.utils.rainflow import count_cycles
        # A large daily swing must not disguise unsupported small nested cycles.
        if any(1e-6 < amplitude < .8-1e-8 for amplitude, _ in count_cycles(soc)) and "depth_range" not in reasons:
            reasons.append("depth_range")
    if soc.min() < -1e-8 or soc.max() > 1 + 1e-8:
        reasons.append("capacity_exhausted")
    rates = np.diff(soc) / np.diff(t / 3600) * soh
    charge = float(max(0, rates.max()))
    discharge = float(max(0, -rates.min()))
    if max(charge, discharge) > 1.75 + 1e-8:
        reasons.append("rate_range")
    # Conservative gate below 25 C; no interpolation of unsupported cold-charge behavior.
    if s.temperature_c < 25 and charge > .3 + 1e-8:
        reasons.append("cold_charge")
    if abs(soc[0] - soc[-1]) > 1e-6:
        reasons.append("open_cycle")
    if s.profile is None and ((s.upper_soc-s.lower_soc) / s.charge_c + (s.upper_soc-s.lower_soc) / s.discharge_c)*s.cycles_per_day > 24:
        reasons.append("cycle_exceeds_day")
    return reasons


def aging(s):
    t, soc = make_profile(s)
    output = {"model": MODEL, "source": SOURCE, "input": s.model_dump(), "scope": {"temperature_c": [10, 45], "depth": [.8, 1], "max_c": 1.75, "cold_charge_c": .3},
              "profile": [[float(a / 3600), float(b)] for a, b in zip(t, soc)], "curve": [], "threshold_day": None,
              "notice": "Reference cell only; no prediction for a branded device. Published fitted model, not independent device validation."}
    reasons = scope_reasons(s, t, soc, 1)
    if reasons:
        return {**output, "status": "unsupported", "reasons": reasons, "soh": None}
    cell = cell_class()()
    curve = [{"day": 0, "soh": 1., "calendar_loss": 0., "cycle_loss": 0., "efc": 0.}]
    status, threshold, reasons = "supported", None, []
    for day in range(1, s.days + 1):
        current = float(cell.outputs["q"][-1])
        t, soc = make_profile(s, current)
        reasons = scope_reasons(s, t, soc, current)
        if reasons:
            status = "stopped_at_boundary"
            break
        cell.update_battery_state(t, soc, np.full_like(t, s.temperature_c))
        q = float(cell.outputs["q"][-1])
        curve.append({"day": day, "soh": q, "calendar_loss": float(cell.states["qLoss_t"][-1]), "cycle_loss": float(cell.states["qLoss_EFC"][-1]), "efc": float(cell.stressors["efc"][-1])})
        if q <= .8 and threshold is None:
            threshold = day
        if q <= 0:
            status, reasons = "stopped_at_boundary", ["capacity_exhausted"]
            break
    return {**output, "status": status, "reasons": reasons, "curve": curve, "soh": curve[-1]["soh"], "threshold_day": threshold}
