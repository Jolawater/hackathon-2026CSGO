"""NitroClock CPU 数据库（示例数据，全部为占位值，待数据组用真实规格替换）。

6 颗示例芯片各讲一个故事：
- DemoCore 8    无冷 bug，全档位可玩（默认演示芯片）
- DemoCore 16   冷 bug -100°C：液氮下电压太低反而崩
- DemoFX        2015 老旗舰：泄漏大、风冷易热失控；液氮需高电压才能热起来
- DemoBook      低压移动芯片：低温相对增益最大（p_t 高）
- DemoEPYC      24 核工作站：400 W 风冷直接热失控；液氮低电压冷崩
- DemoCore X3D  3D 缓存版：缓存对低温敏感（冷 bug -60°C），与液氮/液氦绝缘
"""
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
    coldbug: float | None   # 冷 bug 温度 °C；None = 可下液氮/液氦
    r_jc: float        # 结-壳热阻 K/W
    p_v: float         # 电压指数（标定）
    p_t: float         # 温度指数（标定，<< 1.5）
    t_floor: float     # 频率增益的温度下限 °C（再冷不加速）
    score_ref: float   # 参考跑分（f0 时）


CPUS = [
    CPU(name="DemoCore 8（示例·8核·无冷bug）", f0=5.0, V0=1.30, p_dyn_ref=174.0,
        leak25=6.0, leak_dbl=22.0, tjmax=100.0, coldbug=None, r_jc=0.25,
        p_v=0.45, p_t=0.12, t_floor=-196.0, score_ref=15000.0),
    CPU(name="DemoCore 16（示例·16核·冷bug -100°C）", f0=4.5, V0=1.25,
        p_dyn_ref=184.0, leak25=6.0, leak_dbl=22.0, tjmax=95.0, coldbug=-100.0,
        r_jc=0.20, p_v=0.40, p_t=0.10, t_floor=-196.0, score_ref=20000.0),
    CPU(name="DemoFX 2015（示例·老旗舰·冷bug -80°C）", f0=4.0, V0=1.35,
        p_dyn_ref=200.0, leak25=15.0, leak_dbl=15.0, tjmax=90.0, coldbug=-80.0,
        r_jc=0.30, p_v=0.50, p_t=0.15, t_floor=-196.0, score_ref=11000.0),
    CPU(name="DemoBook（示例·低压移动·15W）", f0=3.0, V0=1.05, p_dyn_ref=40.0,
        leak25=3.0, leak_dbl=25.0, tjmax=100.0, coldbug=None, r_jc=0.40,
        p_v=0.50, p_t=0.18, t_floor=-196.0, score_ref=9000.0),
    CPU(name="DemoEPYC（示例·24核工作站·冷bug -140°C）", f0=4.2, V0=1.25,
        p_dyn_ref=400.0, leak25=25.0, leak_dbl=18.0, tjmax=90.0, coldbug=-140.0,
        r_jc=0.15, p_v=0.30, p_t=0.06, t_floor=-196.0, score_ref=30000.0),
    CPU(name="DemoCore X3D（示例·游戏神U·冷bug -60°C）", f0=4.8, V0=1.25,
        p_dyn_ref=160.0, leak25=5.0, leak_dbl=20.0, tjmax=95.0, coldbug=-60.0,
        r_jc=0.22, p_v=0.35, p_t=0.10, t_floor=-196.0, score_ref=16000.0),
]


def get_cpu(name: str | None = None) -> CPU:
    for c in CPUS:
        if name is None or c.name == name or name in c.name:
            return c
    return CPUS[0]
