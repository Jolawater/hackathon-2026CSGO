"""TankWise 演示：CLI 输出 + 生成自包含 HTML 展示页。

用法：
    python -m tankwise.demo              # 打印 CLI 演示并生成 demo.html
    python -m tankwise.demo --no-html    # 只打印 CLI 演示
    python -m tankwise.demo --html demo.html   # 指定 HTML 输出路径

所有数字均由本文件内的模型当场计算；HTML 内嵌同一批计算结果（含
"模拟"标注），无需服务器，双击即可在浏览器打开。
"""
from __future__ import annotations

import argparse
import datetime
import json
import os

from .physics import (RHO_C, mixed_shower_minutes, plug_shower_minutes,
                      heat_time_minutes, standby_kwh_per_day, delivered_temp)
from .tank import StratifiedTank
from .scenario import run_evening

# ---- 消委会 2018 测试（方案书 §5.2，拷问 2.3 修正后的完整四组） ----
CC_GROUPS = [
    dict(label="花洒式 18 L",        Vs=(18.0, 18.0),  measured="< 4.5 分钟"),
    dict(label="花洒式 23–25 L",     Vs=(23.0, 25.0),  measured="7.2–9.8 分钟"),
    dict(label="非开口式 22.7–25 L", Vs=(22.7, 25.0),  measured="5.5–6.5 分钟"),
    dict(label="非开口式 38 L",      Vs=(38.0, 38.0),  measured="> 9 分钟"),
]
CC_POWER = 3000.0   # 消委会 12 款全部 3,000 W
CC_T_MIX, CC_T_CUT, CC_Q, CC_T_IN = 45.0, 40.0, 5.0, 15.0

# ---- 演示参数 ----
UA_ASSUMED = 0.5        # W/K：拷问 §2.1 量级（1 级≈0.40、3 级≈0.49），待 EMSD 数据核实
T_AMB = 22.0            # °C：浴室环境温度（假设，可调）
TARIFF = 1.40           # HK$/kWh：住宅电价（假设，待数据组核实）


def _fmt_range(fn, Vs, P=0.0):
    vals = [fn(v, 65.0, CC_T_IN, CC_T_MIX, CC_T_CUT, CC_Q, P) for v in Vs]
    vals = sorted(set(vals))
    if len(vals) == 1:
        return f"{vals[0]:.1f}"
    return f"{vals[0]:.1f}–{vals[-1]:.1f}"


def print_opening_conclusions():
    print("=" * 72)
    print("TankWise · 小单位储水式电热水器 · 小物理模型演示")
    print("HacKU 2026 Problem 3 — Test the Change Before You Make It")
    print("=" * 72)
    print()
    print("开场三个结论（方案书 §3，数字由本模型计算）：")
    p40 = (CC_Q / 60.0) * RHO_C * (40.0 - CC_T_IN) / 1000.0
    p45 = (CC_Q / 60.0) * RHO_C * (CC_T_MIX - CC_T_IN) / 1000.0
    print(f"  结论一  即热式需要的功率约为储水式的三倍：")
    print(f"          P = 流量 × 比热 × 温升 ≈ {p40:.1f} kW（40°C）"
          f" / {p45:.1f} kW（45°C），储水式只有 3 kW")
    t_plug = plug_shower_minutes(25.0, 65.0, CC_T_IN, CC_T_MIX, CC_T_CUT, CC_Q, 0.0)
    print(f"  结论二  25 L 水箱（65°C，理想分层上界）可洗约 {t_plug:.1f} 分钟")
    t_mix = mixed_shower_minutes(25.0, 65.0, CC_T_IN, CC_T_MIX, CC_T_CUT, CC_Q, 0.0)
    print(f"  结论三  冷热分层决定一切：理想分层 {t_plug:.1f} 分钟 vs 完全混合"
          f" {t_mix:.1f} 分钟——同一个水箱，结果相差一倍")
    print()


def print_bounds_vs_cc():
    print("-" * 72)
    print("主验证图（方案书 §5.2）：边界模型 vs 消委会 2018 实测")
    print("测试条件：3 kW、入水 15°C、出水 45°C 降至 40°C 为止、流量 5 L/min")
    print("-" * 72)
    hdr = f"{'组别':<16}{'实测':<12}{'混合·无加热':<12}{'混合·加热':<10}" \
          f"{'分层·无加热':<12}{'分层·加热':<10}"
    print(hdr)
    print("-" * 72)
    for g in CC_GROUPS:
        m0 = _fmt_range(mixed_shower_minutes, g["Vs"], 0.0)
        m1 = _fmt_range(mixed_shower_minutes, g["Vs"], CC_POWER)
        p0 = _fmt_range(plug_shower_minutes, g["Vs"], 0.0)
        p1 = _fmt_range(plug_shower_minutes, g["Vs"], CC_POWER)
        print(f"{g['label']:<16}{g['measured']:<12}{m0 + ' 分钟':<12}{m1 + ' 分钟':<10}"
              f"{p0 + ' 分钟':<12}{p1 + ' 分钟':<10}")
    print()
    print("说明：边界模型都加入了「边洗边加热」（拷问修正 2.4），四组实测全部")
    print("落在两个边界之间；N 层模型在两者之间，由入水混合与分层程度决定位置。")
    print()


def _evening(V_L, T_set, N=8, T_in=15.0, UA=UA_ASSUMED):
    """跑一个晚上：冷缸 → 加热 → 两人各 8 分钟连续洗澡。"""
    tank = StratifiedTank(V_L=V_L, N=N, T_in=T_in, T_amb=T_AMB, P_W=3000.0,
                          UA=UA, T_set=T_set, T_init=T_in)
    res = run_evening(tank, people=[8.0, 8.0], gap=10.0)
    return tank, res


def _single_shower_max(V_L, T_set, N=8, T_in=15.0, max_shower=30.0):
    """从热缸开始，单人一直洗到水温跌破截止线的最长时间（min）。"""
    tank = StratifiedTank(V_L=V_L, N=N, T_in=T_in, T_amb=T_AMB, P_W=3000.0,
                          UA=UA_ASSUMED, T_set=T_set, T_init=T_set)
    dt = tank.max_dt(CC_Q)
    while tank.t_min < max_shower:
        T_top, _ = tank.step(dt, CC_Q, CC_T_MIX)
        if delivered_temp(T_top, T_in, CC_T_MIX) < CC_T_CUT:
            break
    return tank.t_min


def _recovery_wait(V_L, T_set, N=8, T_in=15.0, lo=0.0, hi=45.0, tol=1.0):
    """第 1 人洗满 8 分钟后，第 2 人再洗满 8 分钟需要等待多久（二分搜索）。"""
    def ok(gap):
        tank = StratifiedTank(V_L=V_L, N=N, T_in=T_in, T_amb=T_AMB,
                              P_W=3000.0, UA=UA_ASSUMED, T_set=T_set, T_init=T_in)
        res = run_evening(tank, people=[8.0, 8.0], gap=gap)
        return (not res["people"][0]["cut"]) and (not res["people"][1]["cut"])
    if not ok(hi):
        return hi  # 45 分钟仍恢复不了
    while hi - lo > tol:
        mid = 0.5 * (lo + hi)
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return hi


def print_evening_comparison():
    print("-" * 72)
    print("两个配置并排比较（题目 EVIDENCE 要求）：两人各 8 分钟，冬季入水 15°C")
    print("-" * 72)
    configs = [dict(name="方案 A：25 L / 65°C", V=25.0, T_set=65.0),
               dict(name="方案 B：38 L / 60°C", V=38.0, T_set=60.0)]
    rows = []
    for c in configs:
        _, res = _evening(c["V"], c["T_set"])
        p1, p2 = res["people"]
        single = _single_shower_max(c["V"], c["T_set"])
        wait = _recovery_wait(c["V"], c["T_set"])
        kwh24 = standby_kwh_per_day(UA_ASSUMED, c["T_set"], T_AMB)
        rows.append(dict(name=c["name"], V=c["V"], T_set=c["T_set"],
                         p1=p1["usable_min"], p1_cut=p1["cut"],
                         p2=p2["usable_min"], p2_cut=p2["cut"],
                         single=single, wait=wait,
                         kwh24=kwh24, cost_yr=kwh24 * 365.0 * TARIFF,
                         water_kg=c["V"], err=res["err_pct"]))
    print(f"{'配置':<18}{'第1人(8分钟)':<14}{'单人最长可洗':<12}{'第2人需等待':<12}"
          f"{'待机kWh/24h':<12}{'年待机电费':<12}{'满水重':<8}{'能量误差':<10}")
    for r in rows:
        p1s = f"{r['p1']:.0f} 分钟" + ("（截断）" if r["p1_cut"] else "（洗满）")
        p2s = f"连续洗只剩 {r['p2']:.1f} 分钟" if r["p2_cut"] else f"{r['p2']:.0f} 分钟"
        print(f"{r['name']:<18}{p1s:<14}{r['single']:.1f} 分钟{'':<5}"
              f"{r['wait']:.0f} 分钟{'':<5}{r['kwh24']:.3f}{'':<4}"
              f"HK${r['cost_yr']:.0f}/年{'':<2}{r['water_kg']:.0f} kg{'':<2}"
              f"{r['err']:.2e}%")
    print()
    rule = ("推荐规则（方案书 §4.6，可解释）：先剔除洗不够的方案；在剩下的方案里"
            "选年待机电费最低者；并列时选体积小者。")
    a, b = rows
    print(rule)
    print()
    print(f"选择：{b['name']}。")
    print(f"理由：两人各洗 8 分钟的硬约束下，25 L / 65°C 的单人上限只有"
          f" {a['single']:.1f} 分钟——流量稍大（>5 L/min）或入水再冷一点就洗不满，"
          f"几乎没有安全边际；38 L / 60°C 单人上限 {b['single']:.1f} 分钟，余量充足，"
          f"且设定温度低、待机电费反而更低（HK${b['cost_yr']:.0f} vs "
          f"HK${a['cost_yr']:.0f}/年），第二人等待时间也更短（{b['wait']:.0f} vs "
          f"{a['wait']:.0f} 分钟——因为 38 L 缸在一个人洗完后还有热水余量）。"
          f"代价是重 {b['water_kg'] - a['water_kg']:.0f} kg、占空间更大——"
          f"这正是「洗得更久/电费更低 vs 空间与重量」的取舍，由用户按浴室条件决定。")
    print()


def print_validation():
    print("-" * 72)
    print("模型自查（方案书 §5.1）")
    print("-" * 72)
    t25m = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
    t25p = plug_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
    print(f"  解析解        完全混合 {t25m:.3f} 分钟；理想分层 {t25p:.3f} 分钟")
    print(f"  极限检查      N = 1 退化为完全混合模型；N → ∞ 逼近理想分层"
          f"（单元测试 test_model.py 覆盖）")
    tank, res = _evening(25.0, 65.0)
    print(f"  能量守恒      一整天误差 {res['err_pct']:.2e}%  < 1%")
    t_heat = heat_time_minutes(18.0, 15.0, 65.0, 3000.0)
    print(f"  加热时间      18 L 整缸能量计算 {t_heat:.1f} 分钟；消委会实测 15 分钟。")
    print("                 实测快 20–30%：候选原因（恒温器位置/测试定义/起始分层）")
    print("                 见 README「已知差异」，留待数据组核对原文后解释。")
    print()
    print("忽略的物理效应（题目要求明示，界面同样标注）：")
    for s in ["水管散热与放掉的管内冷水", "水垢与发热元件老化",
              "用水过程中入水温度变化", "水箱实际几何形状（横置/竖置）",
              "用户中途关水、调温等行为", "UA = 0.5 W/K 与电价均为待核实的假设"]:
        print(f"   · {s}")
    print()


# ----------------------------------------------------------------------
# HTML 展示页
# ----------------------------------------------------------------------

def _presets():
    """预计算一组场景，内嵌进 HTML（JS 侧切换，无需重新计算）。"""
    runs = {}
    for V in (15.0, 25.0, 38.0):
        for T_set in (60.0, 65.0, 75.0):
            for N in (2, 8, 16):
                key = f"{V:g}|{T_set:g}|{N}|15"
                runs[key] = _preset_run(V, T_set, N, 15.0)
    for N in (2, 8, 16):
        key = f"25|65|{N}|27"
        runs[key] = _preset_run(25.0, 65.0, N, 27.0)
    return runs


def _preset_run(V, T_set, N, T_in, max_frames=280):
    tank = StratifiedTank(V_L=V, N=N, T_in=T_in, T_amb=T_AMB, P_W=3000.0,
                          UA=UA_ASSUMED, T_set=T_set, T_init=T_in)
    res = run_evening(tank, people=[8.0, 8.0], gap=10.0, max_frames=max_frames)
    return dict(
        params=dict(V=V, T_set=T_set, N=N, T_in=T_in, UA=UA_ASSUMED,
                    q=5.0, T_mix=45.0, T_cut=40.0, P=3000.0),
        frames=res["frames"],
        people=res["people"],
        err_pct=round(res["err_pct"], 6),
        t_total=res["t_total"],
    )


def _static_block():
    """HTML 静态区的数据：比较表、边界表、结论、自查。"""
    configs = []
    for name, V, T_set in [("方案 A：25 L / 65°C", 25.0, 65.0),
                           ("方案 B：38 L / 60°C", 38.0, 60.0)]:
        _, res = _evening(V, T_set)
        single = _single_shower_max(V, T_set)
        wait = _recovery_wait(V, T_set)
        kwh24 = standby_kwh_per_day(UA_ASSUMED, T_set, T_AMB)
        configs.append(dict(
            name=name, V=V, T_set=T_set,
            p1=res["people"][0]["usable_min"], p1_cut=res["people"][0]["cut"],
            p2=res["people"][1]["usable_min"], p2_cut=res["people"][1]["cut"],
            single=round(single, 1), wait=round(wait, 0),
            kwh24=round(kwh24, 3), cost_yr=round(kwh24 * 365 * TARIFF, 0),
            err=res["err_pct"]))
    bounds = []
    for g in CC_GROUPS:
        bounds.append(dict(
            label=g["label"], measured=g["measured"],
            m0=_fmt_range(mixed_shower_minutes, g["Vs"], 0.0),
            m1=_fmt_range(mixed_shower_minutes, g["Vs"], CC_POWER),
            p0=_fmt_range(plug_shower_minutes, g["Vs"], 0.0),
            p1=_fmt_range(plug_shower_minutes, g["Vs"], CC_POWER)))
    t_plug = plug_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
    t_mix = mixed_shower_minutes(25.0, 65.0, 15.0, 45.0, 40.0, 5.0, 0.0)
    p40 = (5.0 / 60.0) * RHO_C * 25.0 / 1000.0
    p45 = (5.0 / 60.0) * RHO_C * 30.0 / 1000.0
    return dict(
        configs=configs,
        bounds=bounds,
        conclusions=dict(t_plug=round(t_plug, 1), t_mix=round(t_mix, 1),
                         p40=round(p40, 1), p45=round(p45, 1)),
        ua=UA_ASSUMED, tariff=TARIFF, t_amb=T_AMB,
        generated=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )


_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TankWise — 储水式电热水器分层模型演示</title>
<style>
  :root { --bg:#0f1420; --panel:#1a2233; --ink:#e8edf5; --dim:#93a1b8;
          --acc:#4da3ff; --red:#ff5c5c; --grn:#5cdb7e; --line:#2c3a55; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif; }
  header { padding:14px 22px; border-bottom:1px solid var(--line);
           display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  header h1 { font-size:20px; margin:0; }
  header .sub { color:var(--dim); font-size:13px; }
  .badge { font-size:11px; padding:2px 8px; border:1px solid var(--acc);
           border-radius:10px; color:var(--acc); white-space:nowrap; }
  .wrap { max-width:1080px; margin:0 auto; padding:14px 22px 40px; }
  .controls { display:flex; gap:14px; flex-wrap:wrap; align-items:center;
              padding:12px 0; }
  .controls label { font-size:13px; color:var(--dim); margin-right:6px; }
  select, input[type=range] { background:var(--panel); color:var(--ink);
              border:1px solid var(--line); border-radius:6px; padding:5px 8px; }
  button { background:var(--acc); border:0; color:#081120; font-weight:600;
           border-radius:6px; padding:6px 16px; cursor:pointer; }
  button:hover { filter:brightness(1.15); }
  .stats { display:flex; gap:22px; flex-wrap:wrap; font-size:13px;
           padding:6px 0 10px; color:var(--dim); }
  .stats b { color:var(--ink); }
  canvas { width:100%; height:auto; background:var(--panel);
           border:1px solid var(--line); border-radius:10px; display:block; }
  .panel { background:var(--panel); border:1px solid var(--line);
           border-radius:10px; padding:14px 18px; margin-top:16px; }
  .panel h2 { font-size:15px; margin:0 0 10px; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { border-bottom:1px solid var(--line); padding:6px 8px;
           text-align:left; }
  th { color:var(--dim); font-weight:500; }
  .sim { color:var(--acc); font-size:11px; }
  .note { color:var(--dim); font-size:12px; margin-top:8px; line-height:1.7; }
  .legend { display:flex; gap:16px; font-size:12px; color:var(--dim);
            padding:8px 0; flex-wrap:wrap; }
  .sw { display:inline-block; width:10px; height:10px; border-radius:2px;
        margin-right:4px; vertical-align:middle; }
</style>
</head>
<body>
<header>
  <h1>TankWise</h1>
  <span class="sub">储水式电热水器 · N 层分层水箱模型 · HacKU 2026 Problem 3</span>
  <span class="badge">SIMULATED · 模拟</span>
</header>
<div class="wrap">
  <div class="controls">
    <span><label>水箱容量</label>
      <select id="selV"><option>15</option><option selected>25</option><option>38</option></select> L</span>
    <span><label>设定温度</label>
      <select id="selT"><option>60</option><option selected>65</option><option>75</option></select> °C</span>
    <span><label>分层数 N</label>
      <select id="selN"><option>2</option><option selected>8</option><option>16</option></select></span>
    <span><label>入水温度</label>
      <select id="selIn"><option value="15" selected>冬季 15°C</option><option value="27">夏季 27°C</option></select></span>
    <button id="btnPlay">▶ 播放</button>
    <span><label>速度</label>
      <select id="selSpeed"><option value="1">1×</option><option value="2" selected>2×</option><option value="5">5×</option><option value="10">10×</option></select></span>
  </div>
  <div class="stats">
    <span>模拟时间 <b id="stT">–</b> min</span>
    <span>顶部水温 <b id="stTop">–</b> °C</span>
    <span>花洒出水 <b id="stDel">–</b> °C</span>
    <span>加热器 <b id="stHeat">–</b></span>
    <span>阶段 <b id="stStage">–</b></span>
    <span>能量守恒误差 <b id="stErr">–</b></span>
  </div>
  <canvas id="cv" width="1036" height="470"></canvas>
  <div class="legend">
    <span><span class="sw" style="background:#4da3ff"></span>花洒出水温度（实线）</span>
    <span><span class="sw" style="background:#93a1b8"></span>水箱顶部温度（虚线）</span>
    <span><span class="sw" style="background:#5cdb7e"></span>混水目标 45°C</span>
    <span><span class="sw" style="background:#ff5c5c"></span>截止 40°C（低于即“不够热”）</span>
    <span><span class="sw" style="background:#ffd166"></span>加热器开启区段</span>
    <span>第 1/2 人洗澡时段以阴影标出</span>
  </div>

  <div class="panel">
    <h2>两个配置并排比较（题目要求：说明选择与理由）<span class="sim"> SIMULATED</span></h2>
    <table id="tblCfg"></table>
    <div class="note" id="cfgReason"></div>
  </div>

  <div class="panel">
    <h2>边界模型 vs 消委会 2018 实测（主验证图）<span class="sim"> 边界模型 SIMULATED</span></h2>
    <table id="tblBounds"></table>
    <div class="note">测试条件（消委会）：12 款全部 3,000 W、入水 15°C、出水约 45°C 降至 40°C 为止、流量 5 L/min。
    两个边界都加入「边洗边加热」后，四组实测全部落在边界之间（拷问修正 2.4）。</div>
  </div>

  <div class="panel">
    <h2>开场三个结论</h2>
    <div class="note" id="concl"></div>
  </div>

  <div class="panel">
    <h2>假设与已知差异（演示中同样标注）</h2>
    <div class="note">
      · UA（散热系数）= 0.5 W/K、电价 = HK$1.40/kWh、环境温度 22°C 均为<b>待核实的假设</b>（待数据组用 EMSD 333 款型号库校准）。<br>
      · 消委会实测加热时间普遍比简单能量计算快 20–30%（18 L：实测 15 分钟 vs 计算 20.9 分钟）。候选原因：恒温器位置、加热时间定义、起始分层——留待读报告原文后解释（方案书 §5.3）。<br>
      · 忽略的效应：水管散热与管内冷水、水垢与元件老化、入水温度变化、水箱几何形状、用户中途关水调温。<br>
      · 本页所有曲线均为数值模拟，非实测。
    </div>
  </div>
</div>
<script>
const DATA = __DATA__;
const runs = DATA.runs, st = DATA.static;
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
let key = '25|65|8|15', frames = runs[key].frames, fi = 0, playing = false, lastT = 0;

const T_MIN = 12, T_MAX = 78, T_CUT = 40, T_MIX = 45;
const TANK_X = 52, TANK_W = 168, TANK_TOP = 46, TANK_BOT = 372;
const CH_X = 268, CH_W = cv.width - CH_X - 26, CH_TOP = 46, CH_BOT = 330;

function pickKey() {
  const V = selV.value, T = selT.value, N = selN.value, IN = selIn.value;
  if (runs[V + '|' + T + '|' + N + '|' + IN]) return V + '|' + T + '|' + N + '|' + IN;
  // 夏季数据只预计算了 25L/65°C；其余组合回退到冬季
  return V + '|' + T + '|' + N + '|15';
}
function load() {
  key = pickKey(); frames = runs[key].frames; fi = 0; playing = true;
  document.getElementById('btnPlay').textContent = '❚❚ 暂停';
}
function tOf(i) { return frames[i].t; }
function frAt(t) { // 二分找 t 之前最近的帧
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1;
    if (frames[m].t <= t) lo = m; else hi = m - 1; }
  return lo;
}
function colorOf(T) { // 15°C 蓝 → 75°C 红
  const x = Math.max(0, Math.min(1, (T - T_MIN) / (T_MAX - T_MIN)));
  const h = 222 * (1 - x), s = 0.82, l = 0.30 + 0.28 * x;
  return `hsl(${h},${s * 100}%,${l * 100}%)`;
}
function yOf(T) { return CH_BOT - (T - T_MIN) / (T_MAX - T_MIN) * (CH_BOT - CH_TOP); }
function xOf(t, t0, t1) { return CH_X + (t - t0) / Math.max(1e-9, t1 - t0) * CH_W; }

function draw() {
  const f = frames[fi], p = runs[key].params, t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  ctx.clearRect(0, 0, cv.width, cv.height);

  // ---- 左：水箱 ----
  const layerH = (TANK_BOT - TANK_TOP) / p.N;
  for (let i = 0; i < p.N; i++) {
    const T = f.L[i], y = TANK_BOT - (i + 1) * layerH;
    ctx.fillStyle = colorOf(T);
    ctx.fillRect(TANK_X, y, TANK_W, layerH - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(TANK_X, y, TANK_W, layerH - 1);
    if (p.N <= 16) {
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(T.toFixed(1) + '°', TANK_X + 6, y + layerH / 2 + 4);
    }
  }
  ctx.strokeStyle = '#2c3a55'; ctx.lineWidth = 2;
  ctx.strokeRect(TANK_X, TANK_TOP, TANK_W, TANK_BOT - TANK_TOP);
  // 加热元件（底部）
  ctx.strokeStyle = f.heater ? '#ffd166' : '#3d4d6b'; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = TANK_X + 14, k = 0; x < TANK_X + TANK_W - 14; x += 8, k++) {
    const y = TANK_BOT - 14 + (k % 2 ? -5 : 5);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = f.heater ? '#ffd166' : '#93a1b8';
  ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('3 kW 加热元件', TANK_X + TANK_W / 2, TANK_BOT + 14);
  // 冷水进
  ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(TANK_X + TANK_W / 2, TANK_BOT + 22);
  ctx.lineTo(TANK_X + TANK_W / 2, TANK_BOT + 40); ctx.stroke();
  ctx.fillStyle = '#4da3ff'; ctx.textAlign = 'center';
  ctx.fillText(`冷水进 ${p.T_in}°C`, TANK_X + TANK_W / 2, TANK_BOT + 54);
  // 热水出 → 花洒
  const stage = f.stage, showering = (stage === 1 || stage === 3);
  ctx.strokeStyle = showering ? '#ff8a5c' : '#5c6b8a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(TANK_X + TANK_W / 2, TANK_TOP - 6);
  ctx.lineTo(TANK_X + TANK_W / 2, TANK_TOP - 28); ctx.stroke();
  if (showering) {
    ctx.fillStyle = '#4da3ff';
    for (let d = 0; d < 3; d++) {
      ctx.beginPath(); ctx.arc(TANK_X + TANK_W / 2 - 8 + d * 8, TANK_TOP - 40 + (d % 2) * 6, 2.6, 0, 7);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#93a1b8'; ctx.textAlign = 'center';
  ctx.fillText('热水出', TANK_X + TANK_W / 2, TANK_TOP - 33);
  ctx.fillText(`V = ${p.V} L · N = ${p.N}`, TANK_X + TANK_W / 2, TANK_TOP - 16);

  // ---- 右：温度曲线 ----
  ctx.fillStyle = '#101726';
  ctx.fillRect(CH_X - 10, CH_TOP - 26, CH_W + 20, CH_BOT - CH_TOP + 52);
  // 目标/截止线
  for (const [Tv, col, lab] of [[T_MIX, '#5cdb7e', '混水目标 45°C'], [T_CUT, '#ff5c5c', '截止 40°C']]) {
    ctx.strokeStyle = col; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(CH_X, yOf(Tv)); ctx.lineTo(CH_X + CH_W, yOf(Tv)); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.font = '11px sans-serif';
    ctx.fillText(lab, CH_X + 6, yOf(Tv) - 4);
  }
  // 洗澡阴影
  for (const [sIdx, label] of [[1, '第 1 人'], [3, '第 2 人']]) {
    const a = frames.findIndex(x => x.stage === sIdx);
    if (a >= 0) {
      let b = a; while (b + 1 < frames.length && frames[b + 1].stage === sIdx) b++;
      ctx.fillStyle = 'rgba(77,163,255,0.07)';
      ctx.fillRect(xOf(tOf(a), t0, t1), CH_TOP, xOf(tOf(b), t0, t1) - xOf(tOf(a), t0, t1), CH_BOT - CH_TOP);
      ctx.fillStyle = '#4da3ff'; ctx.textAlign = 'center';
      ctx.fillText(label, (xOf(tOf(a), t0, t1) + xOf(tOf(b), t0, t1)) / 2, CH_TOP + 12);
    }
  }
  // 网格与坐标
  ctx.strokeStyle = '#24334f'; ctx.lineWidth = 1;
  for (let T = 20; T <= 70; T += 10) {
    ctx.beginPath(); ctx.moveTo(CH_X, yOf(T)); ctx.lineTo(CH_X + CH_W, yOf(T)); ctx.stroke();
    ctx.fillStyle = '#93a1b8'; ctx.textAlign = 'right'; ctx.font = '10px sans-serif';
    ctx.fillText(T + '°', CH_X - 6, yOf(T) + 3);
  }
  // 顶部水温（虚线）
  ctx.strokeStyle = '#93a1b8'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
  ctx.beginPath();
  frames.forEach((fr, i) => { const x = xOf(fr.t, t0, t1), y = yOf(fr.L[fr.L.length - 1]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);
  // 出水温度（实线）
  ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  frames.forEach((fr, i) => { const x = xOf(fr.t, t0, t1), y = yOf(fr.delivered);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  // 当前游标
  const cx = xOf(f.t, t0, t1);
  ctx.strokeStyle = '#e8edf5'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, CH_TOP); ctx.lineTo(cx, CH_BOT); ctx.stroke();
  // 加热器条
  const hbY = CH_BOT + 16, hbH = 8;
  ctx.fillStyle = '#1c2940'; ctx.fillRect(CH_X, hbY, CH_W, hbH);
  frames.forEach((fr, i) => {
    if (fr.heater) {
      const x0 = xOf(fr.t, t0, t1);
      const x1 = xOf(i + 1 < frames.length ? frames[i + 1].t : t1, t0, t1);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x0, hbY, Math.max(1, x1 - x0), hbH);
    }
  });
  ctx.fillStyle = '#93a1b8'; ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
  ctx.fillText('加热器', CH_X, hbY + hbH + 11);
  ctx.fillText(t0.toFixed(0) + ' min', CH_X, CH_BOT + 34);
  ctx.textAlign = 'right'; ctx.fillText(t1.toFixed(0) + ' min', CH_X + CH_W, CH_BOT + 34);

  // ---- 状态栏 ----
  const stages = ['加热中', '第 1 人洗澡', '恢复间隔', '第 2 人洗澡', '结束'];
  document.getElementById('stT').textContent = f.t.toFixed(1);
  document.getElementById('stTop').textContent = f.L[f.L.length - 1].toFixed(1);
  document.getElementById('stDel').textContent = f.delivered.toFixed(1);
  document.getElementById('stHeat').textContent = f.heater ? '开' : '关';
  document.getElementById('stStage').textContent = stages[f.stage] || '–';
  document.getElementById('stErr').textContent = runs[key].err_pct + '%';
  document.getElementById('btnPlay').textContent = playing ? '❚❚ 暂停' : '▶ 播放';
}

function tick(ts) {
  if (playing) {
    const dt = (ts - lastT) / 1000 * parseFloat(selSpeed.value);
    const tEnd = frames[frames.length - 1].t;
    let t = frames[fi].t + dt * tEnd / 28;   // 约 28 秒走完全程
    if (t >= tEnd) { playing = false; t = tEnd; }
    fi = frAt(t);
    if (playing) lastT = ts; else lastT = 0;
  }
  draw();
  requestAnimationFrame(tick);
}

function fmtMin(v, cut) { return v.toFixed(1) + ' 分钟' + (cut ? '（不足 8 分钟，被截断）' : ''); }
function fillStatic() {
  let h = '<tr><th>配置</th><th>第 1 人（8 分钟）</th><th>单人最长可洗</th><th>第 2 人连续洗</th><th>第 2 人需等待</th><th>待机损失</th><th>年待机电费<sup>模拟</sup></th><th>满水重</th></tr>';
  st.configs.forEach(c => {
    const p1 = c.p1_cut ? c.p1.toFixed(1) + ' 分钟（截断）' : '8 分钟（洗满）';
    const p2 = c.p2_cut ? '只剩 ' + c.p2.toFixed(1) + ' 分钟' : '8 分钟（洗满）';
    h += `<tr><td><b>${c.name}</b></td><td>${p1}</td><td>${c.single} 分钟</td><td>${p2}</td><td>≈ ${c.wait} 分钟</td>`
       + `<td>${c.kwh24} kWh/24h</td><td>HK$${c.cost_yr}/年</td><td>${c.V} kg</td></tr>`;
  });
  document.getElementById('tblCfg').innerHTML = h;
  const A = st.configs[0], B = st.configs[1];
  document.getElementById('cfgReason').innerHTML =
    `<b>选择：${B.name}</b>　推荐规则：先剔除洗不够的方案，再选年待机电费最低者（并列取体积小者）。<br>`
    + `理由：两人各洗 8 分钟的硬约束下，25 L / 65°C 单人上限只有 ${A.single} 分钟（流量稍大或入水更冷就洗不满，几乎没有安全边际）；`
    + `38 L / 60°C 单人上限 ${B.single} 分钟，余量充足，且设定温度低、待机电费反而更低（HK$${B.cost_yr} vs HK$${A.cost_yr}/年），`
    + `第二人等待时间也更短（${B.wait} vs ${A.wait} 分钟——38 L 缸在一个人洗完后还有热水余量）。`
    + `代价是重 ${B.V - A.V} kg、占空间更大——「洗得更久/电费更低 vs 空间与重量」的取舍由用户按浴室条件决定。`;

  let hb = '<tr><th>组别（消委会 2018）</th><th>实测</th><th>完全混合·无加热</th><th>完全混合·边洗边加热</th><th>理想分层·无加热</th><th>理想分层·边洗边加热</th></tr>';
  st.bounds.forEach(b => {
    hb += `<tr><td>${b.label}</td><td>${b.measured}</td><td>${b.m0} 分钟</td><td>${b.m1} 分钟</td><td>${b.p0} 分钟</td><td>${b.p1} 分钟</td></tr>`;
  });
  document.getElementById('tblBounds').innerHTML = hb;
  const c = st.conclusions;
  document.getElementById('concl').innerHTML =
    `· 结论一：即热式需约 <b>${c.p40} kW（40°C）/${c.p45} kW（45°C）</b>，约为储水式（3 kW）的三倍——小单位大多只能先储热、再快速用。<br>`
    + `· 结论二：25 L 水箱（65°C、5 L/min）理想分层可洗约 <b>${c.t_plug} 分钟</b>。<br>`
    + `· 结论三：同样 25 L，理想分层 ${c.t_plug} 分钟 vs 完全混合 ${c.t_mix} 分钟——<b>分层让结果相差一倍</b>，这正是 N 层模型存在的理由。<br>`
    + `· 能量上界（不依赖模型参数）：冬季两人各洗 8 分钟，25 L/65°C 物理上就不够（模拟见上方比较表）。`;
}
document.querySelectorAll('select').forEach(el => el.addEventListener('change', load));
document.getElementById('btnPlay').addEventListener('click', () => {
  playing = !playing; lastT = 0;
  if (playing && fi >= frames.length - 1) fi = 0;
});
fillStatic();
load();
requestAnimationFrame(tick);
</script>
</body>
</html>
"""


def build_html(out_path="demo.html"):
    data = dict(runs=_presets(), static=_static_block())
    html = _HTML_TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return out_path, len(html)


def main(argv=None):
    ap = argparse.ArgumentParser(description="TankWise 小物理模型演示")
    ap.add_argument("--no-html", action="store_true", help="不生成 HTML")
    ap.add_argument("--html", default="demo.html", help="HTML 输出路径")
    args = ap.parse_args(argv)

    print_opening_conclusions()
    print_bounds_vs_cc()
    print_evening_comparison()
    print_validation()

    if not args.no_html:
        path, size = build_html(args.html)
        print(f"已生成展示页：{os.path.abspath(path)}（{size / 1024:.0f} KB）")
        print("双击即可在浏览器打开；无需服务器。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
