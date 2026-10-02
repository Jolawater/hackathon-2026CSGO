"""TankWise 物理核心：常数、混水计算、两个边界模型的解析解。

单位约定：体积 L，温度 °C，功率 W，时间 min，流量 L/min。
能量：1 L 水升高 1 K 需要 RHO_C = 4186 J。
"""
from __future__ import annotations

import math

RHO_C = 4186.0          # J/(K·L)：1 L 水升高 1 K 所需能量
DEFAULT_POWER = 3000.0  # W：香港储水式电热水器基本均为 3 kW
INF = float("inf")


def heater_term(P_W: float) -> float:
    """加热功率换算成 L·K/min（每分钟能加热多少 L·K 的水）。"""
    return 60.0 * P_W / RHO_C


def heater_rate(P_W: float, V_L: float) -> float:
    """整缸水被加热时的平均升温速率，K/min。"""
    return heater_term(P_W) / V_L


def mix_ratio(T_top: float, T_in: float, T_mix: float) -> float:
    """混水阀从水箱抽取热水占花洒流量的比例 r ∈ [0, 1]。

    T_top 为水箱出水温度，T_in 为入水（冷水）温度，T_mix 为混水目标。
    """
    if T_top <= T_in:
        return 0.0
    r = (T_mix - T_in) / (T_top - T_in)
    return min(max(r, 0.0), 1.0)


def delivered_temp(T_top: float, T_in: float, T_mix: float) -> float:
    """花洒实际出水温度（水箱热水与冷水混合后）。"""
    r = mix_ratio(T_top, T_in, T_mix)
    return r * T_top + (1.0 - r) * T_in


def mixed_shower_minutes(V_L: float, T_tank: float, T_in: float, T_mix: float,
                         T_cut: float, q_Lmin: float, P_W: float = 0.0) -> float:
    """边界模型 A（完全混合）解析解：可连续洗澡分钟数。

    假设：水箱整缸同温；混水阀把出水稳定在 T_mix；水温跌破 T_cut 即算"不够热"。
    若 P_W > 0，假定洗澡全程加热器都在工作（恒温器设定 ≥ 水箱温度，3 kW 在
    5 L/min 抽水下无法把整缸维持在 T_mix，加热器在洗澡期间不会停机）。

    返回 float('inf') 表示加热器足以无限维持花洒温度。
    """
    if T_tank <= T_cut:
        return 0.0
    P_term = heater_term(P_W)          # L·K/min
    cool = q_Lmin * (T_mix - T_in)     # 混水期间水箱每分钟损失的热量（L·K/min）

    # 阶段 1：T ≥ T_mix，混水阀工作，整缸线性降温
    if T_tank > T_mix:
        rate1 = (P_term - cool) / V_L  # K/min
        if rate1 >= 0.0:
            return INF                 # 加热器顶得住，不会降到 T_mix 以下
        t1 = (T_tank - T_mix) / -rate1
    else:
        t1 = 0.0

    # 阶段 2：T < T_mix，出水即整缸温度，向平衡点 T_star 指数衰减
    T_star = T_in + P_term / q_Lmin    # 加热器全开时的平衡温度
    if T_star >= T_cut:
        return INF
    T_start2 = min(T_tank, T_mix)
    if T_start2 <= T_cut:
        return t1
    t2 = (V_L / q_Lmin) * math.log((T_start2 - T_star) / (T_cut - T_star))
    return t1 + t2


def plug_shower_minutes(V_L: float, T_tank: float, T_in: float, T_mix: float,
                        T_cut: float, q_Lmin: float, P_W: float = 0.0) -> float:
    """边界模型 B（理想分层）上界：可连续洗澡分钟数。

    热水从顶部流出、冷水从底部推进、冷热之间完全不混合。带加热时按能量平衡
    上界计算：加热器能量全部用于后续冷水（最乐观情形）。
    """
    if T_tank <= T_cut:
        return 0.0
    P_term = heater_term(P_W)
    denom = q_Lmin * (T_mix - T_in) - P_term
    if denom <= 0.0:
        return INF                     # 加热器能量足以无限维持
    return V_L * (T_tank - T_in) / denom


def heat_time_minutes(V_L: float, T_from: float, T_to: float, P_W: float) -> float:
    """整缸水从 T_from 加热到 T_to 的简单能量计算，min。"""
    if T_to <= T_from:
        return 0.0
    return V_L * (T_to - T_from) * RHO_C / (60.0 * P_W)


def standby_kwh_per_day(UA: float, T_tank: float, T_amb: float) -> float:
    """待机热损失，kWh/24h（EMSD 能源标签口径）。"""
    return UA * (T_tank - T_amb) * 24.0 / 1000.0
