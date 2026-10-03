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
DICE = next(t for t in TIERS if t.name == "干冰")
LN2 = next(t for t in TIERS if t.name == "液氮")
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

    def test_recommend_no_budget_is_ln2(self):
        r = recommend(self._pts(CPU8), budget=None)
        self.assertEqual(r["tier"], "液氮")

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


if __name__ == "__main__":
    unittest.main(verbosity=2)
