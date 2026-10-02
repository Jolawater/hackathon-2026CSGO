"""TankWise 模型校验测试（与方案书 §5 验证方案对应）。

运行：python -m unittest discover -s tests -v
"""
import math
import unittest

from tankwise.physics import (mixed_shower_minutes, plug_shower_minutes,
                              heat_time_minutes, standby_kwh_per_day,
                              heater_term)
from tankwise.tank import StratifiedTank
from tankwise.scenario import run_evening


class TestAnalyticBounds(unittest.TestCase):
    """§5.1 已知关系：解析解。"""

    def test_mixed_25L_matches_proposal(self):
        # 方案书结论二/三：25 L、65°C、入水 15°C、混水 45°C、截止 40°C、5 L/min
        t = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
        self.assertAlmostEqual(t, 4.245, places=2)  # 4.2 分钟（方案书 §3）

    def test_plug_25L_matches_proposal(self):
        t = plug_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
        self.assertAlmostEqual(t, 8.333, places=2)  # 8.3 分钟（方案书 §3）

    def test_heating_time_18L(self):
        # 方案书 §5.3 表：18 L、15→65°C、3 kW 简单能量计算 = 20.9 分钟
        t = heat_time_minutes(18.0, 15.0, 65.0, 3000.0)
        self.assertAlmostEqual(t, 20.93, places=1)

    def test_instant_power_45C(self):
        # 结论一：即热式 5 L/min、15→45°C 需约 10.5 kW；15→40°C 需约 8.7 kW
        # P = 质量流量 × 比热 × 温升 = (5/60 kg/s) × 4186 J/(kg·K) × ΔT
        p45 = (5.0 / 60.0) * 4186.0 * (45.0 - 15.0)
        self.assertAlmostEqual(p45, 10465.0, delta=5.0)
        p40 = (5.0 / 60.0) * 4186.0 * (40.0 - 15.0)
        self.assertAlmostEqual(p40, 8720.8, delta=5.0)

    def test_heating_during_shower_mixed_25L(self):
        # 拷问修正 2.4：边洗边加热，花洒式 23–25 L 完全混合 5.5–6.0 分钟
        t = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 3000.0)
        self.assertAlmostEqual(t, 6.0, delta=0.15)

    def test_heating_during_shower_plug_25L(self):
        # 拷问修正 2.4：理想分层 + 加热，25 L ≈ 11.7 分钟
        t = plug_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 3000.0)
        self.assertAlmostEqual(t, 11.68, delta=0.1)

    def test_heater_sustains_when_power_enough(self):
        # 低流量（1.5 L/min）下加热器平衡温度 T* = 15 + 43/1.5 ≈ 43.7°C > 40°C
        # 截止线 → 热水无限维持（返回 inf）
        t = mixed_shower_minutes(15.0, 65.0, 15.0, 45.0, 40.0, 1.5, 3000.0)
        self.assertTrue(math.isinf(t))

    def test_standby_kwh(self):
        # UA=0.5 W/K、ΔT=43 K → 0.516 kWh/24h（拷问 §2.1 量级）
        kwh = standby_kwh_per_day(0.5, 65.0, 22.0)
        self.assertAlmostEqual(kwh, 0.516, places=2)


class TestStratifiedTank(unittest.TestCase):
    """§5.1 极限检查：N=1 → 完全混合；N 大 → 理想分层；能量守恒。"""

    def _shower_minutes_numeric(self, N, V=25.0, T_set=65.0, P=0.0, UA=0.0,
                                dt=None, T_mix=45.0, T_cut=40.0):
        tank = StratifiedTank(V_L=V, N=N, T_in=15.0, T_amb=22.0, P_W=P, UA=UA,
                              T_set=T_set, T_init=T_set)
        if dt is None:
            dt = 0.01
        t0 = tank.t_min
        while tank.t_min - t0 < 30.0:
            T_top, _ = tank.step(dt, 5.0, T_mix)
            from tankwise.physics import delivered_temp
            if delivered_temp(T_top, tank.T_in, T_mix) < T_cut:
                break
        return tank.t_min - t0

    def test_N1_equals_mixed_analytic(self):
        num = self._shower_minutes_numeric(N=1, P=0.0, UA=0.0)
        ana = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
        self.assertAlmostEqual(num, ana, delta=0.05)

    def test_N1_equals_mixed_analytic_with_heater(self):
        # 解析解假设加热器全程工作；数值模型强制 heater_on 对齐该假设
        tank = StratifiedTank(V_L=25.0, N=1, T_in=15.0, T_amb=22.0, P_W=3000.0,
                              UA=0.0, T_set=65.0, T_init=65.0)
        tank.heater_on = True
        t0 = tank.t_min
        while tank.t_min - t0 < 30.0:
            T_top, _ = tank.step(0.01, 5.0, 45.0)
            from tankwise.physics import delivered_temp
            if delivered_temp(T_top, tank.T_in, 45.0) < 40.0:
                break
        num = tank.t_min - t0
        ana = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 3000.0)
        self.assertAlmostEqual(num, ana, delta=0.05)

    def test_large_N_approaches_plug(self):
        num = self._shower_minutes_numeric(N=128, P=0.0, UA=0.0, dt=0.005)
        plug = plug_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
        self.assertAlmostEqual(num, plug, delta=0.4)

    def test_energy_conservation_full_evening(self):
        tank = StratifiedTank(**dict(V_L=25.0, N=8, T_in=15.0, T_amb=22.0,
                                     P_W=3000.0, UA=0.5, T_set=65.0,
                                     T_init=15.0))
        res = run_evening(tank)
        self.assertLess(abs(res["err_pct"]), 0.01)

    def test_heating_time_close_to_full_tank_calc(self):
        """模型（强对流全混合）加热时间应接近整缸能量计算。

        注意：消委会 2018 实测加热时间普遍比简单能量计算快 20–30%
        （如 18 L 实测 15 分钟 vs 计算 20.9 分钟）。这个差异是方案书
        §5.3 列出的"需要解释的差异"，候选原因见 README，不在小模型
        范围内强行拟合。
        """
        tank = StratifiedTank(V_L=25.0, N=8, T_in=15.0, T_amb=22.0,
                              P_W=3000.0, UA=0.0, T_set=65.0, T_init=15.0)
        saw_on = False
        while tank.t_min < 120.0:
            saw_on = saw_on or tank.heater_on
            tank.step(0.25, 0.0)
            if saw_on and not tank.heater_on:
                break
        full = heat_time_minutes(25.0, 15.0, 65.0, 3000.0)
        # 恒温器在 65+2/2=66°C 停机，略超整缸 65°C 的能量 → 时间略长
        self.assertGreater(tank.t_min, full)
        self.assertLess(tank.t_min, full * 1.06)

    def test_two_person_evening_25L_cut_short(self):
        """两人连续洗澡：25 L / 65°C 冬季不够第二人洗完 8 分钟。"""
        tank = StratifiedTank(V_L=25.0, N=8, T_in=15.0, T_amb=22.0,
                              P_W=3000.0, UA=0.5, T_set=65.0, T_init=65.0)
        res = run_evening(tank, people=[8.0, 8.0], gap=0.0, heatup=False)
        self.assertTrue(res["people"][1]["cut"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
