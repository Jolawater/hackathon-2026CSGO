"""NitroClock 模型校验测试（与方案书 §6 验证方案对应）。

运行：python -m unittest discover -s tests -v
"""
import math
import unittest

from nitroclock.physics import (power_W, f_max, leak_W, mobility_gain,
                                vt_shift, to_k)
from nitroclock.cpus import get_cpu
from nitroclock.cooling import TIERS, tier_cost
from nitroclock.model import solve, assess, grid, recommend, best_value, \
    pareto_frontier, feasible

CPU8 = get_cpu("DemoCore 8")
CPU16 = get_cpu("DemoCore 16")
CPUFX = get_cpu("DemoFX")
CPUBOOK = get_cpu("DemoBook")
CPUEPYC = get_cpu("DemoEPYC")
CPUX3D = get_cpu("DemoCore X3D")
DICE = next(t for t in TIERS if t.name == "干冰")
LN2 = next(t for t in TIERS if t.name == "液氮")
LHE = next(t for t in TIERS if t.name == "液氦")
AIR = TIERS[0]


class TestPhysics(unittest.TestCase):
    """§6.1 已知关系。"""

    def test_power_scales_with_v_squared(self):
        p1 = power_W(CPU8, 1.30, 5.0, 25.0)
        p2 = power_W(CPU8, 1.40, 5.0, 25.0)
        self.assertAlmostEqual(p2 - CPU8.leak25, (p1 - CPU8.leak25) * (1.4 / 1.3) ** 2)

    def test_power_scales_linearly_with_f(self):
        p1 = power_W(CPU8, 1.30, 5.0, 25.0)
        p2 = power_W(CPU8, 1.30, 5.5, 25.0)
        self.assertAlmostEqual(p2 - CPU8.leak25, (p1 - CPU8.leak25) * 5.5 / 5.0)

    def test_leakage_doubles_every_dbl(self):
        l1 = leak_W(CPU8, 25.0)
        l2 = leak_W(CPU8, 25.0 + CPU8.leak_dbl)
        self.assertAlmostEqual(l2, 2.0 * l1)

    def test_f_at_reference_point(self):
        self.assertAlmostEqual(f_max(CPU8, CPU8.V0, 26.85), CPU8.f0, places=9)

    def test_thermal_identity(self):
        s = solve(CPU8, DICE, 1.45)
        self.assertAlmostEqual(s["T_j"], s["coolant"] + s["r_stack"] * s["P"], places=6)

    def test_fixed_point_converged(self):
        self.assertTrue(solve(CPU8, LN2, 1.50)["converged"])

    def test_mobility_theory_upper_bound(self):
        self.assertAlmostEqual(mobility_gain(-196.0),
                               (300.0 / to_k(-196.0)) ** 1.5, places=9)

    def test_vt_shift_sign(self):
        self.assertGreater(vt_shift(-196.0), 0.15)  # 约 +0.18 V


class TestConstraints(unittest.TestCase):
    """§3.3 两个约束：Tjmax 与冷 bug。"""

    def test_air_overheat_at_high_v(self):
        r = assess(CPU8, AIR, 1.70)
        self.assertEqual(r["status"], "hot")

    def test_air_ok_at_low_v(self):
        r = assess(CPU8, AIR, 1.05)
        self.assertEqual(r["status"], "ok")

    def test_ln2_coldbug_cliff(self):
        # 有冷 bug 的芯片：液氮下电压太低 → 结温过低 → 不开机
        self.assertEqual(assess(CPU16, LN2, 1.25)["status"], "cold")
        # 电压拉高 → 功耗加热结温 → 可行（但待机仍有冷 bug 警告）
        self.assertEqual(assess(CPU16, LN2, 1.70)["status"], "warn")

    def test_old_chip_ln2_needs_high_voltage(self):
        # 老旗舰（冷 bug -80°C、高泄漏）：液氮下要靠高电压的热量才能越过冷 bug
        self.assertEqual(assess(CPUFX, LN2, 1.30)["status"], "cold")
        self.assertIn(assess(CPUFX, LN2, 1.70)["status"], ("ok", "warn"))

    def test_x3d_cache_cold_sensitive(self):
        # 3D 缓存版（冷 bug -60°C）：液氮/液氦全冷崩；干冰可行但待机有冷崩警告
        # （-78.5°C 低于冷 bug → 需要带载运行，与真实缓存版行为一致）
        self.assertEqual(assess(CPUX3D, LN2, 1.45)["status"], "cold")
        self.assertEqual(assess(CPUX3D, LHE, 1.45)["status"], "cold")
        self.assertEqual(assess(CPUX3D, DICE, 1.35)["status"], "warn")

    def test_server_chip_air_thermal_runaway(self):
        # 24 核工作站：参考电压下风冷直接热失控
        self.assertEqual(assess(CPUEPYC, AIR, CPUEPYC.V0)["status"], "hot")
        self.assertIn(assess(CPUEPYC, LN2, 1.30)["status"], ("ok", "warn"))

    def test_mobile_chip_cold_gain_largest(self):
        # 低压移动芯片 p_t 最高 → 低温相对增益最大（模型设定，供数据组替换）
        self.assertGreater(CPUBOOK.p_t, CPU8.p_t)

    def test_dice_ok_for_coldbug_cpu(self):
        self.assertEqual(assess(CPU16, DICE, 1.35)["status"], "ok")

    def test_coldbug_free_cpu_full_ln2(self):
        self.assertEqual(assess(CPU8, LN2, 1.40)["status"], "ok")


class TestDecision(unittest.TestCase):
    """§5.4 决策层。"""

    def _pts(self, cpu):
        return grid(cpu, hours=2.0)

    def test_recommend_with_small_budget_is_dice(self):
        r = recommend(self._pts(CPU8), budget=100.0)
        self.assertIsNotNone(r)
        self.assertLessEqual(r["cost"], 100.0)
        self.assertIn(r["tier"], ("干冰", "风冷", "一体水冷", "分体水冷", "冷水机"))

    def test_recommend_no_budget_is_lhe(self):
        # 无预算上限（冲纪录）：液氦结温比液氮更低（-195°C vs -122°C）→ 频率更高
        r = recommend(self._pts(CPU8), budget=None)
        self.assertEqual(r["tier"], "液氦")

    def test_best_value_is_dice(self):
        v = best_value(self._pts(CPU8))
        self.assertEqual(v["tier"], "干冰")

    def test_pareto_frontier_no_dominated_points(self):
        pts = self._pts(CPU8)
        front = pareto_frontier(pts)
        front_set = {(p["tier"], p["V"]) for p in front}
        for p in feasible(pts):
            if (p["tier"], p["V"]) in front_set:
                continue
            self.assertTrue(any(f["score"] >= p["score"] and f["cost"] <= p["cost"]
                                for f in front))

    def test_cost_positive_for_refrigerants(self):
        r = assess(CPU8, LN2, 1.55, 2.0)
        self.assertGreater(r["cost"], 100.0)
        self.assertAlmostEqual(tier_cost(LN2, 0.0, 1.0, 25.0),
                               LN2.equipment_hkd / 50 + LN2.extra_fixed_hkd
                               + LN2.overhead_per_session * LN2.consumable_price)


class TestLiquidHelium(unittest.TestCase):
    """液氦：频率增益封顶 + 成本爆炸 + 大多数芯片冷崩。"""

    def test_lhe_feasible_only_for_coldbug_free(self):
        self.assertIn(assess(CPU8, LHE, 1.45)["status"], ("ok", "warn"))
        self.assertEqual(assess(CPU16, LHE, 1.70)["status"], "cold")

    def test_lhe_faster_but_gain_capped(self):
        # 液氦结温 -195°C 比液氮结温 -122°C 更低 → 频率更高；
        # 但增益不越过 T_floor(-196°C) 设定的封顶
        s_ln2, s_lhe = solve(CPU8, LN2, 1.50), solve(CPU8, LHE, 1.50)
        self.assertGreater(s_lhe["f"], s_ln2["f"])
        cap = CPU8.f0 * (1.50 / CPU8.V0) ** CPU8.p_v * (to_k(-196.0) / 300.0) ** (-CPU8.p_t)
        self.assertLessEqual(s_lhe["f"], cap * (1 + 1e-9))

    def test_lhe_cost_explodes(self):
        # 液氦汽化热只有液氮 ~1/60 → 单场成本高两个数量级
        c_ln2 = assess(CPU8, LN2, 1.50, 2.0)["cost"]
        c_lhe = assess(CPU8, LHE, 1.50, 2.0)["cost"]
        self.assertGreater(c_lhe, 40 * c_ln2)

    def test_lhe_loses_value_race(self):
        # 性价比王仍然是干冰（液氦被排除在赢家之外）
        v = best_value(grid(CPU8, hours=2.0))
        self.assertEqual(v["tier"], "干冰")


class TestHighVoltage(unittest.TestCase):
    """电压上限 2.00 V；>1.70 V 仅标注老化风险，不硬限。"""

    def test_voltage_up_to_2v_allowed(self):
        r = assess(CPU8, LN2, 2.00)
        self.assertIn(r["status"], ("ok", "warn"))
        self.assertTrue(r["degrade"])

    def test_degrade_flag_threshold(self):
        self.assertFalse(assess(CPU8, DICE, 1.70)["degrade"])
        self.assertTrue(assess(CPU8, DICE, 1.75)["degrade"])

    def test_grid_reaches_2v(self):
        pts = grid(CPU8, V_hi=2.00, hours=2.0)
        self.assertTrue(any(p["V"] > 1.95 for p in pts))


if __name__ == "__main__":
    unittest.main(verbosity=2)
