"""Run the model's reference shower case without extra dependencies."""

from model import TankConfig, mixed_delivery_minutes, plug_delivery_minutes, simulate_shower


def main() -> None:
    config = TankConfig()
    result = simulate_shower(config)
    print(f"Completely mixed bound: {mixed_delivery_minutes(config):.2f} min")
    print(f"{config.layers}-layer simulation: {result.delivery_minutes:.2f} min")
    print(f"Ideal stratification bound: {plug_delivery_minutes(config):.2f} min")
    print(f"Energy residual: {result.energy_residual_kwh:.3g} kWh")


if __name__ == "__main__":
    main()

