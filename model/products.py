"""Verified retail models and space/budget constrained scenario search."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from math import isfinite
from pathlib import Path

from .scenario import Configuration, HouseholdNeeds, ScenarioResult, simulate_household


CATALOG = Path(__file__).resolve().parents[1] / "data" / "products.csv"


@dataclass(frozen=True)
class PurchaseConstraints:
    width_cm: float
    height_cm: float
    depth_cm: float
    budget_hkd: float

    def __post_init__(self) -> None:
        values = (self.width_cm, self.height_cm, self.depth_cm, self.budget_hkd)
        if not all(isfinite(value) for value in values):
            raise ValueError("Space and budget must be finite")
        if any(value <= 0 for value in values[:3]) or self.budget_hkd < 0:
            raise ValueError("Space must be positive and budget cannot be negative")


@dataclass(frozen=True)
class Product:
    brand: str
    model: str
    volume_l: float
    power_w: float
    width_cm: float
    height_cm: float
    depth_cm: float
    price_hkd: int
    price_type: str
    price_checked_on: str
    product_url: str
    spec_url: str

    def fits(self, space: PurchaseConstraints) -> bool:
        # Orientation is fixed: rotating a wall-mounted heater is unsafe.
        return (self.width_cm <= space.width_cm and
                self.height_cm <= space.height_cm and
                self.depth_cm <= space.depth_cm)


@dataclass(frozen=True)
class ProductMatch:
    product: Product
    scenario: ScenarioResult


@dataclass(frozen=True)
class ProductRecommendation:
    selected: ProductMatch | None
    alternatives: tuple[ProductMatch, ...]
    catalog_count: int
    fitting_count: int
    affordable_count: int
    eligible_count: int
    feasible_product_count: int
    evaluated_count: int


def load_products(path: Path = CATALOG) -> tuple[Product, ...]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = csv.DictReader(handle)
        products = []
        for row in rows:
            parsed = {key: float(row[key]) for key in
                      ("volume_l", "power_w", "width_cm", "height_cm", "depth_cm")}
            parsed["price_hkd"] = int(row["price_hkd"])
            for key in ("brand", "model", "price_type", "price_checked_on", "product_url", "spec_url"):
                parsed[key] = row[key]
            product = Product(**parsed)
            if (not product.brand or not product.model or product.volume_l <= 0 or
                    product.power_w <= 0 or product.price_hkd < 0 or
                    min(product.width_cm, product.height_cm, product.depth_cm) <= 0 or
                    not product.product_url.startswith("https://") or
                    not product.spec_url.startswith("https://")):
                raise ValueError(f"Invalid catalog record: {product.model}")
            products.append(product)
    return tuple(products)


def recommend_products(
    needs: HouseholdNeeds,
    constraints: PurchaseConstraints,
    *,
    products: tuple[Product, ...] | None = None,
    setpoints_c: tuple[float, ...] = (60.0, 65.0, 70.0, 75.0),
    preheat_options_min: tuple[int, ...] = (30, 45, 60, 90),
) -> ProductRecommendation:
    """Run the physics model for each eligible model and operating strategy.

    Prices are cached catalogue snapshots. Product heating curves and standby
    losses have not yet been measured, so UA is still the generic estimate.
    """
    catalog = load_products() if products is None else products
    fitting = [product for product in catalog if product.fits(constraints)]
    affordable = [product for product in catalog if product.price_hkd <= constraints.budget_hkd]
    eligible = [product for product in fitting if product.price_hkd <= constraints.budget_hkd
                and product.volume_l <= needs.max_volume_l]
    matches = []
    evaluated_count = 0
    feasible_product_count = 0
    for product in eligible:
        feasible_options = []
        for setpoint in setpoints_c:
            options = [Configuration(product.volume_l, setpoint, "always_on")]
            options += [Configuration(product.volume_l, setpoint, "timed", minutes)
                        for minutes in preheat_options_min]
            for option in options:
                result = simulate_household(needs, option, power_w=product.power_w)
                evaluated_count += 1
                if result.feasible:
                    feasible_options.append(result)
        if feasible_options:
            feasible_product_count += 1
            best = min(feasible_options, key=lambda result: (
                result.estimated_annual_standby_kwh,
                result.total_wait_minutes,
            ))
            matches.append(ProductMatch(product, best))
    matches.sort(key=lambda match: (
        match.scenario.estimated_annual_standby_kwh,
        match.product.price_hkd,
        match.product.volume_l,
        match.scenario.total_wait_minutes,
    ))
    return ProductRecommendation(
        selected=matches[0] if matches else None,
        alternatives=tuple(matches[1:]),
        catalog_count=len(catalog),
        fitting_count=len(fitting),
        affordable_count=len(affordable),
        eligible_count=len(eligible),
        feasible_product_count=feasible_product_count,
        evaluated_count=evaluated_count,
    )
