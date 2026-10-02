"""TankWise —— 香港小单位储水式电热水器决策工具（小物理模型）。

HacKU 2026 · Problem 3「Test the Change Before You Make It」
Andy 分支：可运行的分层水箱模型 + 展示 demo。
"""
from . import physics
from .tank import StratifiedTank, default_tank_params
from .scenario import run_evening

__version__ = "0.1.0"
__all__ = ["physics", "StratifiedTank", "default_tank_params", "run_evening"]
