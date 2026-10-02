"""晚间洗澡场景引擎：多人连续洗澡、出水温度曲线、能量守恒检查。

流程：冷缸 → 加热到恒温器第一次停机 → 每人依次洗澡（直到水温跌破
T_cut 或达到该人最大时长）→ 人与人之间间隔 gap 分钟恢复 → 收尾。
"""
from __future__ import annotations

from .physics import delivered_temp
from .tank import StratifiedTank

# 场景默认：两人连续洗澡，每人最多 8 分钟，间隔 10 分钟
DEFAULT_PEOPLE = [8.0, 8.0]
DEFAULT_GAP = 10.0
DEFAULT_Q = 5.0        # L/min（消委会 2018 测试流量）
DEFAULT_T_MIX = 45.0   # °C（混水目标；消委会以出水 45°C 测试）
DEFAULT_T_CUT = 40.0   # °C（出水低于此值即"不够热"）

# 帧的 stage 编码：0 加热 / 1 第 1 人 / 2 间隔 / 3 第 2 人 / 4 结束
STAGE_HEAT, STAGE_P1, STAGE_GAP, STAGE_P2, STAGE_END = 0, 1, 2, 3, 4


def _no_draw_dt(tank: StratifiedTank) -> float:
    """无用水阶段的步长：加热/待机用较小步长保证恒温器精度。"""
    return 0.5


def run_evening(tank: StratifiedTank, people=DEFAULT_PEOPLE, gap=DEFAULT_GAP,
                q_Lmin=DEFAULT_Q, T_mix=DEFAULT_T_MIX, T_cut=DEFAULT_T_CUT,
                heatup=True, max_heatup_min=90.0, max_frames=400,
                max_people=2):
    """运行一个完整晚上，返回结果 dict：

    people   每人结果：[{'max_min', 'usable_min', 'cut'}]
    frames   采样帧：[{'t', 'L', 'heater', 'delivered', 'stage'}]
    t_total  总模拟时长（min）
    e_heat / e_draw / e_standby  能量记账（J）
    err_pct  能量守恒残差（%）
    """
    frames: list = []
    results = dict(people=[], frames=frames, t_total=0.0,
                   e_heat=0.0, e_draw=0.0, e_standby=0.0, err_pct=0.0)

    def record(stage: int, delivered: float):
        frames.append({
            "t": round(tank.t_min, 3),
            "L": [round(float(x), 2) for x in tank.T],
            "heater": 1 if tank.heater_on else 0,
            "delivered": round(delivered, 2),
            "stage": stage,
        })

    # ---- 阶段 0：加热（冷缸 → 恒温器第一次停机） ----
    if heatup:
        dt = _no_draw_dt(tank)
        saw_heat_on = False
        while tank.t_min < max_heatup_min:
            saw_heat_on = saw_heat_on or tank.heater_on
            T_top, _ = tank.step(dt, 0.0, T_mix)
            record(STAGE_HEAT, delivered_temp(T_top, tank.T_in, T_mix))
            if saw_heat_on and not tank.heater_on:
                break  # 已热到设定温度并停机

    # ---- 阶段 1..n：每人洗澡 + 间隔 ----
    n_people = min(len(people), max_people)
    for i in range(n_people):
        max_min = people[i]
        t_start = tank.t_min
        dt = tank.max_dt(q_Lmin)
        cut = False
        stage = STAGE_P1 if i == 0 else STAGE_P2
        while tank.t_min - t_start < max_min:
            T_top, _ = tank.step(dt, q_Lmin, T_mix)
            delivered = delivered_temp(T_top, tank.T_in, T_mix)
            record(stage, delivered)
            if delivered < T_cut:
                cut = True
                break
        usable = tank.t_min - t_start
        if not cut:
            usable = max_min  # 洗满了最大时长（去掉最后一个步长的越界）
        results["people"].append(dict(max_min=max_min, usable_min=round(usable, 2),
                                      cut=cut))
        # 间隔恢复（最后一人之后不间隔）
        if i < n_people - 1 and gap > 0:
            dt = _no_draw_dt(tank)
            t_end = tank.t_min + gap
            while tank.t_min < t_end:
                T_top, _ = tank.step(dt, 0.0, T_mix)
                record(STAGE_GAP, delivered_temp(T_top, tank.T_in, T_mix))

    # ---- 收尾帧 ----
    T_top = float(tank.T[-1])
    record(STAGE_END, delivered_temp(T_top, tank.T_in, T_mix))

    results["t_total"] = round(tank.t_min, 2)
    results["e_heat"] = tank.e_heat
    results["e_draw"] = tank.e_draw
    results["e_standby"] = tank.e_standby
    results["err_pct"] = tank.energy_error_pct()

    # 均匀抽样控制帧数
    if len(frames) > max_frames:
        step = len(frames) / max_frames
        frames[:] = [frames[int(k * step)] for k in range(max_frames)]
    return results
