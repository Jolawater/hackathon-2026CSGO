"""NitroClock 物理层：半导体/制冷剂常数与纯函数。

单位约定：温度 °C（内部换算 K），电压 V，频率 GHz，功率 W，时间 h，成本 HK$。
所有公式只依赖物性常数与每芯片标定参数（见 cpus.py）。
"""
from __future__ import annotations

T_0 = 300.0        # 参考温度（K，≈26.85°C）；f0/V0 定义于此
MU_EXP = 1.5       # 声子散射迁移率指数 μ ∝ T^(-1.5)（纯物理上界）
VT_300 = 0.40      # 300 K 阈值电压（V，示例值）
VT_KAPPA = 0.8e-3  # 阈值电压温度系数（V/K，量级 0.5–1 mV/K）

# 制冷剂物性
LN2_T_C = -196.0
LN2_LATENT_J_PER_L = 160_600.0   # ≈199 kJ/kg × 0.807 kg/L
DICE_T_C = -78.5
DICE_LATENT_J_PER_KG = 571_000.0


def to_k(T_c: float) -> float:
    return T_c + 273.15


def mobility_gain(T_c: float) -> float:
    """纯迁移率上界：(T_0 / T)^1.5。77 K 时 ≈ 7.7 倍。"""
    return (T_0 / to_k(T_c)) ** MU_EXP


def vt_shift(T_c: float) -> float:
    """低温下阈值电压上升量（V）。300→77 K 约 +0.18 V。

    Vt 随温度升高而下降（负温度系数），故冷却时 Vt 上升：
    Vt(T) = Vt(300K) − κ·(T−300K)，κ ≈ 0.5–1 mV/K。
    """
    return VT_KAPPA * ((T_0 - 273.15) - T_c)


def theory_overdrive_loss(T_c: float, V: float) -> float:
    """低温下 (V−Vt)² 驱动下降比（平方律饱和区近似）。"""
    vt = VT_300 + vt_shift(T_c)
    r = (V - vt) / (V - VT_300)
    return max(r, 1e-6) ** 2


def leak_W(cpu, T_c: float) -> float:
    """泄漏功率：每 leak_dbl °C 翻倍（芯片标定参数）。"""
    return cpu.leak25 * 2.0 ** ((T_c - 25.0) / cpu.leak_dbl)


def power_W(cpu, V: float, f: float, T_c: float) -> float:
    """总功耗 = 动态 P_dyn_ref·(V/V0)²·(f/f0) + 泄漏。"""
    return cpu.p_dyn_ref * (V / cpu.V0) ** 2 * (f / cpu.f0) + leak_W(cpu, T_c)


def f_max(cpu, V: float, T_c: float) -> float:
    """频率响应 f(V, T) = f0·(V/V0)^p_v·(T/300)^(-p_t)。

    冷 bug：结温低于 T_coldbug 直接不开机（返回 0）。
    说明：p_t=1.5 是纯迁移率上界，真实芯片远小于此（电路时序余量、
    Vt 上升被标定指数吸收），故 p_t 是每芯片标定参数（示例 0.10–0.12）。
    """
    if cpu.coldbug is not None and T_c < cpu.coldbug:
        return 0.0
    return cpu.f0 * (V / cpu.V0) ** cpu.p_v * (to_k(T_c) / T_0) ** (-cpu.p_t)
