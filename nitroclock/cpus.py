"""NitroClock CPU 数据库（示例数据，全部为占位值，待数据组用真实规格替换）。"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CPU:
    name: str          # 显示名
    f0: float          # 参考频率 GHz（在 V0、300 K 下）
    V0: float          # 参考电压 V
    p_dyn_ref: float   # 参考动态功耗 W（在 V0、f0 下）
    leak25: float      # 25°C 泄漏功率 W
    leak_dbl: float    # 泄漏翻倍温距 °C
    tjmax: float       # 结温上限 °C
    coldbug: float | None   # 冷 bug 温度 °C；None = 可下液氮
    r_jc: float        # 结-壳热阻 K/W
    p_v: float         # 电压指数（标定）
    p_t: float         # 温度指数（标定，<< 1.5）
    score_ref: float   # 参考跑分（f0 时）


CPUS = [
    CPU(name="DemoCore 8（示例·8 核）", f0=5.0, V0=1.30, p_dyn_ref=174.0,
        leak25=6.0, leak_dbl=22.0, tjmax=100.0, coldbug=None, r_jc=0.25,
        p_v=0.45, p_t=0.12, score_ref=15000.0),
    CPU(name="DemoCore 16（示例·16 核·有冷 bug）", f0=4.5, V0=1.25,
        p_dyn_ref=184.0, leak25=6.0, leak_dbl=22.0, tjmax=95.0, coldbug=-100.0,
        r_jc=0.20, p_v=0.40, p_t=0.10, score_ref=20000.0),
]


def get_cpu(name: str | None = None) -> CPU:
    for c in CPUS:
        if name is None or c.name == name or name in c.name:
            return c
    return CPUS[0]
