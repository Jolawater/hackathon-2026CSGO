"""NitroClock 散热档位表（示例参数，全部为占位值，待数据组核实）。

每档成本模型：单场成本 = 设备费 / 50 场摊销 + 耗材。
干冰/液氮的耗材与热负荷成正比（升华热/汽化热），另加每场固定预冷量。
"""
from __future__ import annotations

from dataclasses import dataclass

from .physics import (LN2_T_C, LN2_LATENT_J_PER_L, DICE_T_C,
                      DICE_LATENT_J_PER_KG, LHE_T_C, LHE_LATENT_J_PER_L)

AMORTIZE_SESSIONS = 50.0     # 设备按 50 场摊销（假设）
TARIFF = 1.4                 # HK$/kWh（占位）


@dataclass
class Tier:
    name: str
    coolant_c: float     # 冷却介质温度（°C）；风/水冷为环境温度
    r_cooler: float      # 散热器/炮热阻 K/W（R_stack = r_jc + r_cooler）
    equipment_hkd: float
    refrigerant: str | None   # None=无耗材 / "ln2" / "dice"
    consumable_price: float   # HK$/L 或 HK$/kg
    overhead_per_session: float   # 每场固定预冷量（L 或 kg）
    extra_fixed_hkd: float    # 每场固定费（如杜瓦租金）
    risk: int                  # 风险排名（0 最低），并列时用
    note: str = ""


TIERS = [
    Tier("风冷",       25.0,  0.15, 400.0,  None,   0.0,  0.0, 0.0, 0, "塔式散热器，设备 HK$400（占位）"),
    Tier("一体水冷",   25.0,  0.10, 900.0,  None,   0.0,  0.0, 0.0, 0, "240 mm AIO（占位）"),
    Tier("分体水冷",   25.0,  0.05, 2500.0, None,   0.0,  0.0, 0.0, 1, "自组水冷（占位）"),
    Tier("冷水机",     5.0,   0.05, 4000.0, None,   0.0,  0.0, 0.0, 1, "压缩机恒温 5°C；电费另计"),
    Tier("干冰",       DICE_T_C, 0.05, 500.0, "dice", 12.0, 2.0, 0.0, 2,
         "炮 HK$500；干冰 HK$12/kg（占位）"),
    Tier("液氮",       LN2_T_C,  0.05, 800.0, "ln2",  15.0, 5.0, 150.0, 3,
         "炮 HK$800；液氮 HK$15/L + 杜瓦租 HK$150/场（占位）"),
    Tier("液氦",       LHE_T_C,  0.05, 1200.0, "lhe", 150.0, 10.0, 0.0, 4,
         "4.2 K；HK$150/L（占位）。实际冲分先液氮预冷、短时运行，用量可降一个量级（待核实）"),
]


def tier_cost(tier: Tier, power_W: float, hours: float, T_amb: float) -> float:
    """单场成本（HK$）：设备摊销 + 耗材 + 固定费 + 电费（仅冷水机）。"""
    cost = tier.equipment_hkd / AMORTIZE_SESSIONS + tier.extra_fixed_hkd
    if tier.refrigerant == "ln2":
        litres = power_W * hours * 3600.0 / LN2_LATENT_J_PER_L + tier.overhead_per_session
        cost += litres * tier.consumable_price
    elif tier.refrigerant == "dice":
        kg = power_W * hours * 3600.0 / DICE_LATENT_J_PER_KG + tier.overhead_per_session
        cost += kg * tier.consumable_price
    elif tier.refrigerant == "lhe":
        # 液氦汽化热只有液氮的 ~1/60：同样的热负荷要用 60 倍的体积
        litres = power_W * hours * 3600.0 / LHE_LATENT_J_PER_L + tier.overhead_per_session
        cost += litres * tier.consumable_price
    if tier.name == "冷水机":
        cost += power_W / 1000.0 * hours * TARIFF
    return cost
