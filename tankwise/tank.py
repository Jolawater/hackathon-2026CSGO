"""N 层分层水箱模型（TankWise 核心模型）。

把水箱竖直分为 N 个等体积水平层，每层内部完全混合。每个时间步依次执行
（顺序与方案书 §4.4 一致）：

1. 加热：加热元件所在层获得 P·s(t)·dt 的热量
2. 散热：每层按 (UA/N)·(T_i − T_amb) 散热
3. 用水：从顶部抽出 q_h·dt 的热水（混水阀按目标温度配比），各层水向上
   平移（上风格式），底部补入 T_in 冷水
4. 浮力修正：若下层比上层热，两层合并取平均（模拟自然对流混合），
   重复直到没有逆温
5. 恒温器：按传感器所在层温度与回差更新 s(t)

稳定性要求（Courant 数 ≤ 1）：q_h·dt ≤ 每层体积，即 dt ≤ layer_V / q。
N = 1 时退化为完全混合模型；N 很大时逼近理想分层上界。
"""
from __future__ import annotations

import numpy as np

from .physics import RHO_C, mix_ratio


class StratifiedTank:
    def __init__(self, V_L: float = 25.0, N: int = 8, T_in: float = 15.0,
                 T_amb: float = 22.0, P_W: float = 3000.0, UA: float = 0.0,
                 T_set: float = 65.0, hysteresis: float = 2.0,
                 T_init: float | None = None, element_layer: int = 0,
                 sensor_layer: int | None = None):
        self.V_L = float(V_L)
        self.N = int(N)
        self.layer_V = self.V_L / self.N
        self.T_in = float(T_in)
        self.T_amb = float(T_amb)
        self.P_W = float(P_W)
        self.UA = float(UA)
        self.T_set = float(T_set)
        self.hysteresis = float(hysteresis)
        # 默认：加热元件在底部（常见立式缸），恒温器传感器在顶部
        self.element_layer = element_layer
        self.sensor_layer = self.N - 1 if sensor_layer is None else sensor_layer

        T0 = T_set if T_init is None else float(T_init)
        self.T = np.full(self.N, T0, dtype=float)
        self.heater_on = T0 < T_set - hysteresis / 2.0

        # 能量记账（J）
        self.e_heat = 0.0      # 加热器输入
        self.e_draw = 0.0      # 抽出的热水带走
        self.e_standby = 0.0   # 待机散热
        self.e0 = self._energy_now()  # 初始储热（相对 T_in 零点）
        self.t_min = 0.0

    # ---- 内部工具 -------------------------------------------------
    def _energy_now(self) -> float:
        """水箱内储存的热能（以 T_in 为零点），J。"""
        return float(np.sum(self.T - self.T_in)) * RHO_C * self.layer_V

    def energy_error_pct(self) -> float:
        """能量守恒残差：|输入 − 输出 − 储热变化| / 输入（1e-6 为数值噪声）。"""
        dE = self._energy_now() - self.e0
        resid = self.e_heat - self.e_draw - self.e_standby - dE
        scale = max(abs(self.e_heat), 1.0)
        return 100.0 * abs(resid) / scale

    def max_dt(self, q_max_Lmin: float) -> float:
        """满足 Courant 条件的最大时间步（min），同时不超过 1 min。"""
        if q_max_Lmin <= 0:
            return 1.0
        return min(self.layer_V / q_max_Lmin, 1.0)

    # ---- 一个时间步 -------------------------------------------------
    def step(self, dt: float, q_Lmin: float = 0.0, T_mix: float = 45.0) -> tuple:
        """推进一个时间步（min）。

        参数：
            dt     时间步长，min（调用方须保证 q_h·dt ≤ layer_V）
            q_Lmin 花洒总流量，L/min（0 表示没人洗澡）
            T_mix  混水目标温度，°C

        返回：(T_top, q_h) —— 水箱顶部温度与从水箱抽出的热水流量。
        """
        # 1) 加热（元素层：升温 = heater_term / 层体积）
        if self.heater_on:
            dT = heater_term_local(self.P_W) * self.N / self.V_L * dt
            self.T[self.element_layer] += dT
            self.e_heat += self.P_W * dt * 60.0

        # 2) 待机散热（每层 UA/N，按层体积折算能量）
        if self.UA > 0.0:
            dT_i = self.UA * dt * 60.0 * (self.T - self.T_amb) / (RHO_C * self.V_L)
            self.e_standby += float(np.sum(dT_i)) * RHO_C * self.layer_V
            self.T = self.T - dT_i

        # 3) 用水（上风格式：水向上平移，顶部流出、底部补入 T_in 冷水）
        T_top = float(self.T[-1])
        q_h = q_Lmin * mix_ratio(T_top, self.T_in, T_mix)
        vh = q_h * dt
        if vh > 0.0:
            vol = self.layer_V
            self.e_draw += vh * RHO_C * (T_top - self.T_in)
            w = (vol - vh) / vol
            T_new = np.empty_like(self.T)
            T_new[0] = w * self.T[0] + (1.0 - w) * self.T_in
            for i in range(1, self.N):
                T_new[i] = w * self.T[i] + (1.0 - w) * self.T[i - 1]
            self.T = T_new

        # 4) 浮力修正（下层热于上层 → 两层混合）
        for _ in range(self.N):
            changed = False
            for i in range(self.N - 1):
                if self.T[i] > self.T[i + 1]:
                    avg = 0.5 * (self.T[i] + self.T[i + 1])
                    self.T[i] = avg
                    self.T[i + 1] = avg
                    changed = True
            if not changed:
                break

        # 5) 恒温器（传感器层温度 + 回差）
        T_s = float(self.T[self.sensor_layer])
        if self.heater_on and T_s > self.T_set + self.hysteresis / 2.0:
            self.heater_on = False
        elif not self.heater_on and T_s < self.T_set - self.hysteresis / 2.0:
            self.heater_on = True

        self.t_min += dt
        return T_top, q_h


def heater_term_local(P_W: float) -> float:
    """P W 加热器每分钟提供的 L·K（供模型内部使用，见 physics.heater_term）。"""
    return 60.0 * P_W / RHO_C


def default_tank_params() -> dict:
    """演示与测试共用的默认参数。"""
    return dict(V_L=25.0, N=8, T_in=15.0, T_amb=22.0, P_W=3000.0,
                UA=0.5, T_set=65.0, hysteresis=2.0, T_init=15.0)
