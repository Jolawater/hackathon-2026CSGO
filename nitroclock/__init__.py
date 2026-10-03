"""NitroClock —— CPU 低温超频决策工具（可运行的小物理模型）。

HacKU 2026 · Problem 3「Test the Change Before You Make It」
nitroclock 分支：三层模型（热网络 + 功耗 + 频率响应）+ 两个约束（Tjmax / 冷 bug）
+ 决策层（帕累托 + 可解释推荐）。
"""
from . import physics, cpus, cooling, model

__version__ = "0.1.0"
__all__ = ["physics", "cpus", "cooling", "model"]
