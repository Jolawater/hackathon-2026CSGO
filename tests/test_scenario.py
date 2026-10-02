import unittest

from model.optimize import recommend_configuration
from model.scenario import (
    Configuration,
    HouseholdNeeds,
    estimate_ua_w_per_k,
    simulate_household,
)


class ScenarioTests(unittest.TestCase):
    def test_emsd_reference_loss_is_reproduced(self):
        ua = estimate_ua_w_per_k(25.0)
        self.assertAlmostEqual(ua * 45.0 * 24.0 / 1000.0, 0.86, places=8)

    def test_wait_can_make_second_shower_feasible(self):
        option = Configuration(38.0, 60.0, "timed", 45)
        without_wait = simulate_household(HouseholdNeeds(max_wait_minutes=0), option)
        with_wait = simulate_household(HouseholdNeeds(max_wait_minutes=15), option)
        self.assertFalse(without_wait.feasible)
        self.assertTrue(with_wait.feasible)
        self.assertGreater(with_wait.people[1].wait_minutes, 0)
        self.assertLessEqual(with_wait.people[1].wait_minutes, 15)

    def test_default_recommendation_meets_every_shower(self):
        needs = HouseholdNeeds()
        result = recommend_configuration(needs)
        self.assertEqual(result.evaluated_count, 80)
        self.assertIsNotNone(result.selected)
        self.assertTrue(result.selected.feasible)
        self.assertTrue(all(person.complete for person in result.selected.people))
        self.assertLessEqual(result.selected.configuration.volume_l, needs.max_volume_l)
        self.assertEqual(result.selected, min(
            (item for item in result.evaluated if item.feasible),
            key=lambda item: (item.estimated_annual_standby_kwh,
                              item.configuration.volume_l,
                              item.total_wait_minutes),
        ))

    def test_no_feasible_option_is_reported_without_fabricating_one(self):
        result = recommend_configuration(HouseholdNeeds(max_volume_l=15.0))
        self.assertIsNone(result.selected)
        self.assertEqual(result.feasible_count, 0)


if __name__ == "__main__":
    unittest.main()
