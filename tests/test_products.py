import unittest

from model.products import PurchaseConstraints, load_products, recommend_products
from model.scenario import HouseholdNeeds


class ProductRecommendationTests(unittest.TestCase):
    def test_catalog_has_verifiable_prices_and_dimensions(self):
        products = load_products()
        self.assertGreaterEqual(len(products), 4)
        self.assertGreaterEqual(len({product.brand for product in products}), 2)
        for product in products:
            self.assertTrue(product.product_url.startswith("https://"))
            self.assertGreater(product.price_hkd, 0)
            self.assertGreater(product.depth_cm, 0)

    def test_default_recommendation_fits_budget_and_space(self):
        constraints = PurchaseConstraints(40, 75, 40, 3500)
        result = recommend_products(HouseholdNeeds(), constraints)
        self.assertIsNotNone(result.selected)
        self.assertEqual(result.selected.product.model, "JHR-10 3kW")
        self.assertTrue(result.selected.product.fits(constraints))
        self.assertLessEqual(result.selected.product.price_hkd, constraints.budget_hkd)
        self.assertTrue(result.selected.scenario.feasible)

    def test_insufficient_space_or_budget_does_not_fabricate_a_product(self):
        needs = HouseholdNeeds()
        cramped = recommend_products(needs, PurchaseConstraints(20, 50, 20, 10000))
        self.assertIsNone(cramped.selected)
        self.assertEqual(cramped.fitting_count, 0)
        cheap = recommend_products(needs, PurchaseConstraints(100, 100, 100, 500))
        self.assertIsNone(cheap.selected)
        self.assertEqual(cheap.affordable_count, 0)


if __name__ == "__main__":
    unittest.main()
