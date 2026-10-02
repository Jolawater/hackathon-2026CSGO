import unittest
from dataclasses import replace

from model import (
    TankConfig,
    TankSimulator,
    mixed_delivery_minutes,
    plug_delivery_minutes,
    simulate_shower,
)


class TankPhysicsTests(unittest.TestCase):
    def setUp(self):
        self.base = TankConfig()

    def test_default_reference_bounds(self):
        self.assertAlmostEqual(mixed_delivery_minutes(self.base), 4.24494, places=4)
        self.assertAlmostEqual(plug_delivery_minutes(self.base), 8.33333, places=4)

    def test_one_layer_matches_exact_mixed_solution(self):
        config = replace(self.base, layers=1)
        result = simulate_shower(config, dt_s=0.5)
        self.assertAlmostEqual(result.delivery_minutes, mixed_delivery_minutes(config), delta=0.03)

    def test_more_layers_approach_ideal_stratification(self):
        durations = [
            simulate_shower(replace(self.base, layers=n), dt_s=0.5).delivery_minutes
            for n in (1, 12, 100)
        ]
        self.assertLess(durations[0], durations[1])
        self.assertLess(durations[1], durations[2])
        self.assertLess(durations[2], plug_delivery_minutes(self.base))
        self.assertLess(plug_delivery_minutes(self.base) - durations[2], 0.4)

    def test_energy_balance_with_heating_draw_and_standby(self):
        config = replace(self.base, ua_w_per_k=1.48)
        simulator = TankSimulator(config)
        for _ in range(1800):
            simulator.step(1.0, shower_on=True, heater_enabled=True)
        self.assertAlmostEqual(simulator.energy_residual_j(), 0.0, delta=1e-6)
        self.assertGreater(simulator.heater_j, 0)
        self.assertGreater(simulator.draw_j, 0)

    def test_stratification_remains_monotone_after_bottom_heating(self):
        simulator = TankSimulator(replace(self.base, layers=8))
        for _ in range(100):
            simulator.step(1.0, shower_on=True, heater_enabled=True)
        t = simulator.temperatures_c
        self.assertTrue(all(t[i] <= t[i + 1] + 1e-12 for i in range(len(t) - 1)))

    def test_courant_limit_is_enforced(self):
        with self.assertRaisesRegex(ValueError, "Courant"):
            simulate_shower(replace(self.base, layers=100), dt_s=60)


if __name__ == "__main__":
    unittest.main()

