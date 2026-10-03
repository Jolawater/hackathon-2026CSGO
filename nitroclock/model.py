"""NitroClock 核心模型：求解 (T_j, P, f) 耦合不动点 + 约束判定 + 决策层。

约束（按团队决定只保留两个最重要的）：
1. T_j ≤ Tjmax（过热）
2. T_j ≥ T_coldbug（冷 bug；结露/供电上限等不建模，见 README）
"""
from __future__ import annotations

from .physics import power_W, f_max, leak_W
from .cooling import Tier, TIERS, tier_cost

STATUS_OK = "ok"        # 可行
STATUS_HOT = "hot"      # 过热（T_j > Tjmax）
STATUS_COLD = "cold"    # 冷 bug（T_j < T_coldbug）
STATUS_WARN = "warn"    # 可行，但待机温度低于冷 bug（液氮低负载现实风险）


def solve(cpu, tier: Tier, V: float, T_amb: float = 25.0,
          n_iter: int = 50) -> dict:
    """求解一个 (档位, 电压) 配置的稳态工作点。

    耦合关系：P = P(V, f, T_j)（泄漏依赖温度），T_j = T_coolant + R·P，
    f = f_max(V, T_j)。用不动点迭代（泄漏耦合弱，收敛极快）。
    """
    r_stack = cpu.r_jc + tier.r_cooler
    coolant = tier.coolant_c if tier.refrigerant else T_amb
    # 热初值：从冷初值出发会被冷 bug 卡在零负载解（f=0 → 无功耗 → 更冷）。
    tj = 100.0
    f = cpu.f0
    converged = False
    runaway = False
    for _ in range(n_iter):
        p = power_W(cpu, V, f, tj)
        tj_new = coolant + r_stack * p
        # 温度钳位：泄漏-温度正反馈可能使结温发散（热失控）。
        # 钳位到 400°C 后迭代稳定，assess 会将其判定为「过热」。
        if tj_new >= 399.0:
            runaway = True
        tj_new = min(max(tj_new, -270.0), 400.0)
        f = f_max(cpu, V, tj_new)
        if abs(tj_new - tj) < 1e-9:
            tj = tj_new
            converged = True
            break
        tj = tj_new
    p = power_W(cpu, V, f, tj)
    return dict(V=V, T_j=tj, P=p, f=f, coolant=coolant, r_stack=r_stack,
                converged=converged, runaway=runaway)


def _idle_tj(cpu, tier: Tier, T_amb: float) -> float:
    """待机（近零负载）结温：液氮下会逼近 -196°C。"""
    r_stack = cpu.r_jc + tier.r_cooler
    coolant = tier.coolant_c if tier.refrigerant else T_amb
    tj = coolant
    for _ in range(6):
        tj = coolant + r_stack * leak_W(cpu, tj)
    return tj


def assess(cpu, tier: Tier, V: float, hours: float = 2.0,
           T_amb: float = 25.0) -> dict:
    """判定一个配置的可行性、状态与单场成本。

    只保留两个硬约束（Tjmax / 冷 bug）；V > 1.70 V 仅标注电迁移
    老化风险（degrade=True），不硬限。
    """
    s = solve(cpu, tier, V, T_amb)
    if s["f"] == 0.0:
        status = STATUS_COLD
    elif s["T_j"] > cpu.tjmax:
        status = STATUS_HOT
    else:
        status = STATUS_OK
        if cpu.coldbug is not None:
            idle = _idle_tj(cpu, tier, T_amb)
            if idle < cpu.coldbug:
                status = STATUS_WARN
    score = cpu.score_ref * s["f"] / cpu.f0 if s["f"] > 0 else 0.0
    cost = tier_cost(tier, s["P"], hours, T_amb)
    return dict(**s, tier=tier.name, status=status, score=score, cost=cost,
                risk=tier.risk, degrade=V > 1.70)


def grid(cpu, V_lo=1.00, V_hi=1.70, step=0.05, hours=2.0, T_amb=25.0):
    """档位 × 电压网格 → 全部评估点。"""
    points = []
    v = V_lo
    while v <= V_hi + 1e-9:
        for tier in TIERS:
            points.append(assess(cpu, tier, v, hours, T_amb))
        v += step
    return points


def feasible(points) -> list:
    return [p for p in points if p["status"] in (STATUS_OK, STATUS_WARN)]


def recommend(points, budget: float | None = None):
    """推荐规则（可解释）：预算内最高分；并列取成本更低者；再并列取风险更低档位。"""
    cands = feasible(points)
    if budget is not None:
        cands = [p for p in cands if p["cost"] <= budget]
    if not cands:
        return None
    return max(cands, key=lambda p: (p["score"], -p["cost"], -p["risk"]))


def best_value(points, refrigerant_only: bool = True):
    """性价比王：每港币最高分。

    refrigerant_only=True 时只在低温档（干冰/液氮/液氦）里选——整体口径下
    风冷（近零单场成本）必然胜出，那本身也是结论：「上低温不是为了划算」。
    """
    cands = feasible(points)
    if refrigerant_only:
        cands = [p for p in cands if p["tier"] in ("干冰", "液氮", "液氦")]
    else:
        cands = [p for p in cands if p["cost"] > 0]
    if not cands:
        return None
    return max(cands, key=lambda p: p["score"] / p["cost"])


def pareto_frontier(points):
    """帕累托前沿：成本不更高而分数不低于的支配点。"""
    fe = feasible(points)
    fe.sort(key=lambda p: (p["cost"], -p["score"]))
    front = []
    best_score = -1.0
    for p in fe:
        if p["score"] > best_score:
            front.append(p)
            best_score = p["score"]
    return front
