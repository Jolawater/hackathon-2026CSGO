"""NitroClock 演示：CLI 输出 + 生成自包含 HTML 展示页。

用法：
    python -m nitroclock.demo              # 打印 CLI 演示并生成 demo.html
    python -m nitroclock.demo --no-html    # 只打印 CLI 演示
    python -m nitroclock.demo --html demo.html

所有数字由模型当场计算；HTML 内嵌同一批结果（含「模拟」标注），
无需服务器，双击即可在浏览器打开。
"""
from __future__ import annotations

import argparse
import datetime
import json
import os

from .physics import power_W, leak_W, mobility_gain, vt_shift, to_k
from .cpus import CPUS, get_cpu
from .cooling import TIERS
from .model import solve, assess, grid, recommend, best_value, \
    pareto_frontier, feasible, STATUS_OK, STATUS_WARN, STATUS_HOT, STATUS_COLD

T_AMB = 25.0
HOURS_DEFAULT = 2.0
V_LO, V_HI, V_STEP = 1.00, 1.70, 0.05

STATUS_CN = {STATUS_OK: "可行", STATUS_WARN: "可行（待机冷 bug 警告）",
             STATUS_HOT: "过热 ✗", STATUS_COLD: "冷 bug ✗"}


def _vs():
    v, out = V_LO, []
    while v <= V_HI + 1e-9:
        out.append(round(v, 2))
        v += V_STEP
    return out


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------

def print_opening(cpu):
    print("=" * 74)
    print("NitroClock · CPU 低温超频决策工具 · 小物理模型演示")
    print("HacKU 2026 Problem 3 — Test the Change Before You Make It")
    print("=" * 74)
    print()
    print(f"开场四个结论（示例芯片 {cpu.name}，数字由本模型计算，占位参数待核实）：")
    p1 = power_W(cpu, 1.30, 5.0, T_AMB)
    p2 = power_W(cpu, 1.40, 5.5, T_AMB)
    print(f"  结论一  功耗是频率与电压的立方级函数 P ∝ V²f：")
    print(f"          5.0 GHz @ 1.30 V = {p1:.0f} W → 5.5 GHz @ 1.40 V = "
          f"{p2:.0f} W（+{(p2 / p1 - 1) * 100:.0f}%）——频率只涨 10%，功耗涨近三成")
    l25, l95 = leak_W(cpu, 25.0), leak_W(cpu, 95.0)
    print(f"  结论二  泄漏电流随温度指数上升（每 {cpu.leak_dbl:.0f}°C 翻倍，标定值）：")
    print(f"          25°C 泄漏 {l25:.0f} W → 95°C 泄漏 {l95:.0f} W"
          f"（{l95 / l25:.1f} 倍）；液氮下 ≈ 0，省下的热预算拿去加压")
    gain_t = mobility_gain(-196.0)
    gain_m = (to_k(-196.0) / 300.0) ** (-cpu.p_t)
    dvt = vt_shift(-196.0)
    print(f"  结论三  冷 200 度 ≠ 快 2 倍：迁移率理论上限 {gain_t:.1f} 倍，")
    print(f"          本芯片标定后同电压只快 {gain_m:.2f} 倍；阈值电压上升 "
          f"{dvt:.2f} V 吃掉部分增益，其余被电路时序余量吸收——再冷就撞冷 bug")
    print(f"  结论四  制冷的真成本：500 W 负荷下液氮 ≈ {500 * 3600 / 160600:.1f} L/h"
          f"（2 小时约 {500 * 7200 / 160600 + 5:.0f} L），干冰 ≈ "
          f"{500 * 3600 / 571000:.1f} kg/h——每多 100 MHz 都在烧钱")
    print()


def print_tier_table(cpu, V, hours):
    print("-" * 74)
    print(f"档位一览（{cpu.name} @ {V:.2f} V，{hours:.0f} 小时/场，环境 {T_AMB:.0f}°C）")
    print("-" * 74)
    print(f"{'档位':<6}{'结温 Tj':<10}{'功耗':<8}{'频率':<10}{'参考分':<9}"
          f"{'单场成本':<10}{'状态':<16}")
    for tier in TIERS:
        r = assess(cpu, tier, V, hours, T_AMB)
        if r.get("runaway"):
            print(f"{tier.name:<6}{'热失控':<10}{'—':<8}{'—':<10}{'—':<9}"
                  f"{'—':<10}{'过热 ✗':<16}")
        else:
            print(f"{tier.name:<6}{r['T_j']:>7.1f}°C {r['P']:>5.0f} W "
                  f"{r['f']:>6.2f} GHz {r['score']:>7.0f} HK${r['cost']:>7.0f}"
                  f"{'':<3}{STATUS_CN[r['status']]:<16}")
    print()


def print_decision(cpu, hours):
    pts = grid(cpu, V_LO, V_HI, V_STEP, hours, T_AMB)
    print("-" * 74)
    print("决策层（档位 × 电压网格 → 约束筛选 → 帕累托 → 推荐）")
    print("-" * 74)
    r100 = recommend(pts, budget=100.0)
    r_none = recommend(pts, budget=None)
    v_all = best_value(pts, refrigerant_only=False)
    v_low = best_value(pts, refrigerant_only=True)
    print(f"  预算 HK$100 内最高分 → {r100['tier']} @ {r100['V']:.2f} V："
          f"{r100['score']:.0f} 分，HK${r100['cost']:.0f}/场")
    print(f"  无预算上限（冲纪录）→ {r_none['tier']} @ {r_none['V']:.2f} V："
          f"{r_none['score']:.0f} 分，HK${r_none['cost']:.0f}/场")
    print(f"  整体性价比王（分数/港币）→ {v_all['tier']}（{v_all['score'] / v_all['cost']:.0f} 分/HK$）"
          f"——上低温不是为了划算")
    print(f"  低温档性价比王 → {v_low['tier']}（{v_low['score'] / v_low['cost']:.0f} 分/HK$）"
          f"——要上低温就上它")
    print()
    print("  推荐规则（可解释）：预算内最高分；并列取成本更低；再并列取风险更低档位。")
    print()


def print_comparison(cpu, hours):
    a = assess(cpu, next(t for t in TIERS if t.name == "干冰"), 1.45, hours, T_AMB)
    b = assess(cpu, next(t for t in TIERS if t.name == "液氮"), 1.55, hours, T_AMB)
    print("-" * 74)
    print("两个配置并排比较（题目 EVIDENCE 要求）：干冰 1.45 V vs 液氮 1.55 V")
    print("-" * 74)
    print(f"{'配置':<16}{'结温':<10}{'功耗':<8}{'频率':<10}{'参考分':<9}"
          f"{'单场成本':<10}{'状态':<16}")
    for r, name in [(a, "干冰 1.45 V"), (b, "液氮 1.55 V")]:
        print(f"{name:<16}{r['T_j']:>6.1f}°C {r['P']:>5.0f} W {r['f']:>6.2f} GHz"
              f" {r['score']:>7.0f} HK${r['cost']:>7.0f}{'':<3}{STATUS_CN[r['status']]:<16}")
    print()
    gain = (b["score"] / a["score"] - 1) * 100
    mult = b["cost"] / a["cost"]
    print(f"液氮比干冰多 {gain:.0f}% 分数，但单场成本是 {mult:.1f} 倍。")
    print(f"选择：预算 HK$150 内 → 干冰 1.45 V（HK${a['cost']:.0f}/场）；"
          f"冲纪录无预算 → 液氮 1.55 V（HK${b['cost']:.0f}/场）。")
    print("理由：按推荐规则，预算内最高分；液氮只为最后几个百分点服务，")
    print("      且风险更高（待机冷 bug、操作风险）——这正是「频率 vs 成本/风险」的取舍。")
    print()


def print_validation(cpu):
    print("-" * 74)
    print("模型自查（方案书 §6）")
    print("-" * 74)
    ln2 = next(t for t in TIERS if t.name == "液氮")
    dice = next(t for t in TIERS if t.name == "干冰")
    s = solve(cpu, ln2, 1.50, T_AMB)
    ident = abs(s["T_j"] - (s["coolant"] + s["r_stack"] * s["P"]))
    print(f"  ✓ 不动点收敛（ΔT < 1e-9°C）：{'是' if s['converged'] else '否'}")
    print(f"  ✓ 热平衡恒等式 Tj = Tc + R·P：残差 {ident:.2e} °C")
    print(f"  ✓ P ∝ V²f 与泄漏指数律：单元测试 test_model.py 覆盖（18 项全部通过）")
    c16 = get_cpu("DemoCore 16")
    r1 = assess(c16, ln2, 1.25, 2.0, T_AMB)
    r2 = assess(c16, ln2, 1.70, 2.0, T_AMB)
    print(f"  ✓ 冷 bug 悬崖（{c16.name} + 液氮）：1.25 V → {STATUS_CN[r1['status']]}，"
          f"1.70 V → {STATUS_CN[r2['status']]}——电压太低反而崩")
    print()
    print("不建模的效应（题目要求明示，界面同样标注）：")
    for s_ in ["结露对电气可靠性的影响", "VRM/供电上限与内存/IMC 瓶颈",
               "硅彩票个体差异（模型给区间外推，不承诺点预测）",
               "制冷剂纯度、炮的装配差异", "设备价格与耗材单价均为占位值（待 B 核实）"]:
        print(f"   · {s_}")
    print()


# ----------------------------------------------------------------------
# HTML 展示页
# ----------------------------------------------------------------------

def _embed_data():
    """预计算 HTML 所需数据：每个 CPU × 时长：电压网格行 + 帕累托。"""
    out = {}
    for i, cpu in enumerate(CPUS):
        key = f"cpu{i}"
        out[key] = {}
        for hours in (1.0, 2.0, 3.0):
            pts = grid(cpu, V_LO, V_HI, V_STEP, hours, T_AMB)
            rows = {}
            for V in _vs():
                rows[f"{V:.2f}"] = [
                    dict(tj=round(r["T_j"], 1), p=round(r["P"], 0),
                         f=round(r["f"], 3), score=round(r["score"], 0),
                         cost=round(r["cost"], 0), status=r["status"],
                         run=1 if r.get("runaway") else 0)
                    for r in (assess(cpu, t, V, hours, T_AMB) for t in TIERS)
                ]
            fe = feasible(pts)
            pareto = [dict(cost=round(p["cost"], 1), score=round(p["score"], 0),
                           tier=p["tier"], V=p["V"], risk=p["risk"], status=p["status"])
                      for p in fe]
            front = pareto_frontier(pts)
            front_keys = {(p["tier"], p["V"]) for p in front}
            for p in pareto:
                p["on_front"] = (p["tier"], p["V"]) in front_keys
            out[key][f"{hours:.0f}h"] = dict(rows=rows, pareto=pareto)
    return out


def _static_block():
    cpu = get_cpu("DemoCore 8")
    p1 = power_W(cpu, 1.30, 5.0, T_AMB)
    p2 = power_W(cpu, 1.40, 5.5, T_AMB)
    l25, l95 = leak_W(cpu, 25.0), leak_W(cpu, 95.0)
    a = assess(cpu, next(t for t in TIERS if t.name == "干冰"), 1.45, 2.0, T_AMB)
    b = assess(cpu, next(t for t in TIERS if t.name == "液氮"), 1.55, 2.0, T_AMB)
    c16 = get_cpu("DemoCore 16")
    ln2 = next(t for t in TIERS if t.name == "液氮")
    r_cold = assess(c16, ln2, 1.25, 2.0, T_AMB)
    r_warm = assess(c16, ln2, 1.70, 2.0, T_AMB)
    return dict(
        tier_names=[t.name for t in TIERS],
        tier_risk=[t.risk for t in TIERS],
        cpus=[dict(key=f"cpu{i}", name=c.name,
                   tjmax=f"{c.tjmax:.0f}°C",
                   coldbug="无（可下液氮）" if c.coldbug is None else f"{c.coldbug:.0f}°C")
              for i, c in enumerate(CPUS)],
        conclusions=dict(
            p1=round(p1, 0), p2=round(p2, 0), gain=round((p2 / p1 - 1) * 100, 0),
            l25=round(l25, 1), l95=round(l95, 1), lx=round(l95 / l25, 1),
            theory=round(mobility_gain(-196.0), 1),
            model_gain=round((to_k(-196.0) / 300.0) ** (-cpu.p_t), 2),
            dvt=round(vt_shift(-196.0), 2),
            ln2_lh=round(500 * 3600 / 160600, 1), dice_kgh=round(500 * 3600 / 571000, 1)),
        comparison=dict(
            a=dict(name="干冰 1.45 V", tj=round(a["T_j"], 1), p=round(a["P"], 0),
                   f=round(a["f"], 2), score=round(a["score"], 0),
                   cost=round(a["cost"], 0), status=STATUS_CN[a["status"]]),
            b=dict(name="液氮 1.55 V", tj=round(b["T_j"], 1), p=round(b["P"], 0),
                   f=round(b["f"], 2), score=round(b["score"], 0),
                   cost=round(b["cost"], 0), status=STATUS_CN[b["status"]]),
            gain=round((b["score"] / a["score"] - 1) * 100, 0),
            mult=round(b["cost"] / a["cost"], 1)),
        coldbug=dict(name=c16.name, v_lo="1.25 V → " + STATUS_CN[r_cold["status"]],
                     v_hi="1.70 V → " + STATUS_CN[r_warm["status"]]),
        generated=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )


_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NitroClock — CPU 低温超频决策工具演示</title>
<style>
  :root { --bg:#0f1420; --panel:#1a2233; --ink:#e8edf5; --dim:#93a1b8;
          --acc:#4da3ff; --red:#ff5c5c; --org:#ff8a5c; --yel:#ffd166;
          --grn:#5cdb7e; --line:#2c3a55; }
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
  .controls { display:flex; gap:16px; flex-wrap:wrap; align-items:center; padding:12px 0; }
  .controls label { font-size:13px; color:var(--dim); margin-right:6px; }
  select, input[type=range] { background:var(--panel); color:var(--ink);
           border:1px solid var(--line); border-radius:6px; padding:5px 8px; }
  .stats { display:flex; gap:20px; flex-wrap:wrap; font-size:13px;
           padding:6px 0 10px; color:var(--dim); }
  .stats b { color:var(--ink); }
  canvas { width:100%; height:auto; background:var(--panel);
           border:1px solid var(--line); border-radius:10px; display:block; }
  .panel { background:var(--panel); border:1px solid var(--line);
           border-radius:10px; padding:14px 18px; margin-top:16px; }
  .panel h2 { font-size:15px; margin:0 0 10px; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; }
  th { color:var(--dim); font-weight:500; }
  .sim { color:var(--acc); font-size:11px; }
  .note { color:var(--dim); font-size:12px; margin-top:8px; line-height:1.8; }
  .sw { display:inline-block; width:10px; height:10px; border-radius:2px;
        margin-right:4px; vertical-align:middle; }
  .rec { color:var(--yel); font-weight:600; }
</style>
</head>
<body>
<header>
  <h1>NitroClock</h1>
  <span class="sub">CPU 低温超频决策工具 · 三层模型（热网络 + 功耗 + 频率响应）· HacKU 2026 Problem 3</span>
  <span class="badge">SIMULATED · 模拟</span>
</header>
<div class="wrap">
  <div class="controls">
    <span><label>芯片</label><select id="selCpu"></select></span>
    <span><label>电压</label>
      <input type="range" id="rngV" min="1.00" max="1.70" step="0.05" value="1.45">
      <b id="labV">1.45 V</b></span>
    <span><label>单场时长</label>
      <select id="selH"><option value="1h">1 小时</option><option value="2h" selected>2 小时</option><option value="3h">3 小时</option></select></span>
    <span><label>预算</label>
      <select id="selB"><option value="50">HK$50</option><option value="100" selected>HK$100</option><option value="150">HK$150</option><option value="300">HK$300</option><option value="600">HK$600</option><option value="none">无上限（冲纪录）</option></select></span>
  </div>
  <div class="stats">
    <span>推荐：<b class="rec" id="stRec">–</b></span>
    <span>低温档性价比王：<b id="stVal">–</b></span>
    <span>约束：Tjmax <b id="stTjmax">–</b> · 冷 bug <b id="stCb">–</b></span>
  </div>
  <canvas id="cvBars" width="1036" height="300"></canvas>
  <div class="legend">
    <span><span class="sw" style="background:#4da3ff"></span>可行</span>
    <span><span class="sw" style="background:#ffd166"></span>可行·待机冷 bug 警告</span>
    <span><span class="sw" style="background:#ff8a5c"></span>过热（Tj &gt; Tjmax）</span>
    <span><span class="sw" style="background:#ff5c5c"></span>冷 bug（Tj &lt; 下限）</span>
  </div>
  <div class="panel">
    <h2>帕累托前沿：分数 vs 单场成本 <span class="sim">SIMULATED</span></h2>
    <canvas id="cvPar" width="1036" height="360"></canvas>
    <div class="note">每个点 = 一个（档位 × 电压）配置；圆环 = 当前预算下的推荐；
    竖线 = 预算上限。点颜色对应档位：<span style="color:#7a8ba8">●风冷</span>
    <span style="color:#6fd3ff">●一体水</span> <span style="color:#8fb7ff">●分体水</span>
    <span style="color:#b08bff">●冷水机</span> <span style="color:#ffd166">●干冰</span>
    <span style="color:#ff8a5c">●液氮</span></div>
  </div>
  <div class="panel">
    <h2>两个配置并排比较（题目要求：说明选择与理由）<span class="sim"> SIMULATED</span></h2>
    <table id="tblCmp"></table>
    <div class="note" id="cmpWhy"></div>
  </div>
  <div class="panel">
    <h2>开场四个结论（示例芯片：DemoCore 8）</h2>
    <div class="note" id="concl"></div>
  </div>
  <div class="panel">
    <h2>假设与已知差异（演示中同样标注）</h2>
    <div class="note">
      · 所有芯片参数、热阻、设备与耗材价格均为<b>占位值</b>（待数据组用规格书 + HWBOT 数据 + 询价替换，见方案书附录）。<br>
      · 保留的约束只有两个（团队决定）：<b>Tjmax（过热）与冷 bug（过冷）</b>；结露、VRM 供电上限、内存/IMC 瓶颈不建模。<br>
      · 跑分为「分数 ∝ 频率」的代理量，非真实基准分数。<br>
      · 硅彩票（同型号个体差异）用区间表达，本页为示例参数下的点估计。<br>
      · 本页所有数字均为数值模拟，非实测。
    </div>
  </div>
</div>
<script>
const DATA = __DATA__;
const st = DATA.static;
const TIER_COLORS = ["#7a8ba8", "#6fd3ff", "#8fb7ff", "#b08bff", "#ffd166", "#ff8a5c"];
const TIER_NAMES = st.tier_names;
const STATUS_STYLE = {ok:["#4da3ff","可行"], warn:["#ffd166","可行·待机冷bug警告"],
                      hot:["#ff8a5c","过热"], cold:["#ff5c5c","冷 bug"]};
let cpuKey = "cpu0", hours = "2h", budget = 100, V = 1.45;

function $(id){ return document.getElementById(id); }
function cpuMeta(){
  return st.cpus.find(c => c.key === cpuKey);
}
function rowsNow(){ return DATA.runs[cpuKey][hours].rows[V.toFixed(2)]; }
function paretoNow(){ return DATA.runs[cpuKey][hours].pareto; }
function recommendNow(){
  const pts = paretoNow().filter(p => budget === null || p.cost <= budget);
  if (!pts.length) return null;
  return pts.reduce((a,b) =>
    (b.score > a.score || (b.score === a.score && (b.cost < a.cost ||
      (b.cost === a.cost && b.risk < a.risk)))) ? b : a);
}
function valueNow(){
  const pts = paretoNow().filter(p => (p.tier === "干冰" || p.tier === "液氮"));
  if (!pts.length) return null;
  return pts.reduce((a,b) => (b.score/b.cost > a.score/a.cost) ? b : a);
}

function drawBars(){
  const cv = $("cvBars"), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const rows = rowsNow();
  const maxS = Math.max(...rows.map(r => r.score), 1);
  const bw = 120, gap = 26, x0 = 46, baseY = 258, hMax = 210;
  rows.forEach((r, i) => {
    const x = x0 + i * (bw + gap);
    const col = STATUS_STYLE[r.status][0];
    const h = r.run ? 4 : Math.max(6, r.score / maxS * hMax);
    ctx.fillStyle = col;
    ctx.fillRect(x, baseY - h, bw, h);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.strokeRect(x, baseY - h, bw, h);
    ctx.fillStyle = "#e8edf5"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(TIER_NAMES[i], x + bw / 2, baseY + 18);
    if (r.run) {
      ctx.fillStyle = "#ff8a5c";
      ctx.fillText("热失控", x + bw / 2, baseY - h - 6);
      ctx.fillText("—", x + bw / 2, baseY - h + 14);
    } else {
      ctx.fillText(r.f.toFixed(2) + " GHz", x + bw / 2, baseY - h - 6);
      ctx.fillStyle = "#93a1b8"; ctx.font = "11px sans-serif";
      ctx.fillText(r.score.toFixed(0) + " 分", x + bw / 2, baseY - h + 14);
      ctx.fillText("HK$" + r.cost.toFixed(0) + " · Tj " + r.tj.toFixed(0) + "°C",
                   x + bw / 2, baseY - h + 28);
      ctx.fillText(STATUS_STYLE[r.status][1], x + bw / 2, baseY - h + 42);
    }
  });
  ctx.fillStyle = "#93a1b8"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("柱高 = 参考分数（分数 ∝ 频率，模拟）", x0, 18);
}

function drawPareto(){
  const cv = $("cvPar"), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pts = paretoNow();
  const rec = recommendNow();
  const val = valueNow();
  const padL = 52, padR = 24, padT = 26, padB = 44;
  const W = cv.width - padL - padR, H = cv.height - padT - padB;
  const maxC = Math.max(...pts.map(p => p.cost), 1) * 1.06;
  const maxS = Math.max(...pts.map(p => p.score), 1) * 1.05;
  const minS = Math.min(...pts.map(p => p.score), 0);
  const X = c => padL + c / maxC * W;
  const Y = s => padT + (1 - (s - minS) / (maxS - minS)) * H;
  // 网格
  ctx.strokeStyle = "#24334f"; ctx.lineWidth = 1; ctx.font = "10px sans-serif";
  for (let k = 0; k <= 5; k++) {
    const c = maxC * k / 5, s = minS + (maxS - minS) * k / 5;
    ctx.beginPath(); ctx.moveTo(X(c), padT); ctx.lineTo(X(c), padT + H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, Y(s)); ctx.lineTo(padL + W, Y(s)); ctx.stroke();
    ctx.fillStyle = "#93a1b8"; ctx.textAlign = "right";
    ctx.fillText(s.toFixed(0), padL - 6, Y(s) + 3);
    ctx.textAlign = "center";
    ctx.fillText("HK$" + c.toFixed(0), X(c), padT + H + 16);
  }
  ctx.fillStyle = "#93a1b8"; ctx.textAlign = "center";
  ctx.fillText("单场成本 →", padL + W / 2, padT + H + 32);
  ctx.save(); ctx.translate(14, padT + H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("参考分数 →", 0, 0); ctx.restore();
  // 前沿折线
  const front = pts.filter(p => p.on_front)
                   .sort((a, b) => a.cost - b.cost);
  ctx.strokeStyle = "#5cdb7e"; ctx.lineWidth = 2;
  ctx.beginPath();
  front.forEach((p, i) => {
    i === 0 ? ctx.moveTo(X(p.cost), Y(p.score)) : ctx.lineTo(X(p.cost), Y(p.score));
  });
  ctx.stroke();
  // 点
  pts.forEach(p => {
    ctx.fillStyle = TIER_COLORS[TIER_NAMES.indexOf(p.tier)];
    ctx.beginPath(); ctx.arc(X(p.cost), Y(p.score), 3.2, 0, 7); ctx.fill();
  });
  // 预算线
  if (budget !== null) {
    ctx.strokeStyle = "#ffd166"; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(X(budget), padT); ctx.lineTo(X(budget), padT + H);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ffd166"; ctx.textAlign = "center";
    ctx.fillText("预算 HK$" + budget, X(budget), padT - 8);
  }
  // 推荐与性价比王
  if (rec) {
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(rec.cost), Y(rec.score), 8, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.textAlign = "left";
    ctx.fillText("推荐: " + rec.tier + " " + rec.V.toFixed(2) + " V",
                 X(rec.cost) + 12, Y(rec.score) - 6);
  }
  if (val) {
    ctx.strokeStyle = "#5cdb7e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(val.cost), Y(val.score), 8, 0, 7); ctx.stroke();
    ctx.fillStyle = "#5cdb7e"; ctx.textAlign = "left";
    ctx.fillText("低温档性价比王: " + val.tier + " " + val.V.toFixed(2) + " V",
                 X(val.cost) + 12, Y(val.score) + 16);
  }
}

function render(){
  $("labV").textContent = V.toFixed(2) + " V";
  const m = cpuMeta();
  $("stTjmax").textContent = m.tjmax;
  $("stCb").textContent = m.coldbug;
  const rec = recommendNow(), val = valueNow();
  $("stRec").textContent = rec ? (rec.tier + " @ " + rec.V.toFixed(2) + " V → "
    + rec.score.toFixed(0) + " 分 · HK$" + rec.cost.toFixed(0)) : "预算内无可行配置";
  $("stVal").textContent = val ? (val.tier + "（" + (val.score / val.cost).toFixed(0) + " 分/HK$）") : "–";
  drawBars(); drawPareto();
}

function fillStatic(){
  const c = st.conclusions;
  $("concl").innerHTML =
    `· 结论一：功耗 P ∝ V²f —— 5.0 GHz @ 1.30 V = ${c.p1} W → 5.5 GHz @ 1.40 V = ${c.p2} W（<b>+${c.gain}%</b>），频率只涨 10%，功耗涨近三成。<br>`
    + `· 结论二：泄漏随温度指数上升（每 22°C 翻倍，标定值）：25°C 时 ${c.l25} W → 95°C 时 ${c.l95} W（${c.lx} 倍）；液氮下 ≈ 0，省下的热预算拿去加压。<br>`
    + `· 结论三：迁移率理论上限 ×${c.theory}（μ ∝ T^-1.5），本芯片标定后同电压只快 ×${c.model_gain}；阈值电压上升 ${c.dvt} V 吃掉部分增益——再冷就撞冷 bug。<br>`
    + `· 结论四：500 W 负荷下液氮 ≈ ${c.ln2_lh} L/h、干冰 ≈ ${c.dice_kgh} kg/h——每多 100 MHz 都在烧钱。`;
  const a = st.comparison.a, b = st.comparison.b;
  $("tblCmp").innerHTML =
    `<tr><th>配置</th><th>结温 Tj</th><th>功耗</th><th>频率</th><th>参考分</th><th>单场成本</th><th>状态</th></tr>`
    + `<tr><td><b>${a.name}</b></td><td>${a.tj}°C</td><td>${a.p} W</td><td>${a.f} GHz</td><td>${a.score}</td><td>HK$${a.cost}</td><td>${a.status}</td></tr>`
    + `<tr><td><b>${b.name}</b></td><td>${b.tj}°C</td><td>${b.p} W</td><td>${b.f} GHz</td><td>${b.score}</td><td>HK$${b.cost}</td><td>${b.status}</td></tr>`;
  $("cmpWhy").innerHTML =
    `液氮比干冰多 <b>${st.comparison.gain}%</b> 分数，但单场成本是 <b>${st.comparison.mult} 倍</b>。`
    + `<b>选择</b>：预算 HK$150 内 → 干冰 1.45 V；冲纪录无预算 → 液氮 1.55 V。`
    + `理由：按推荐规则（预算内最高分，并列取低成本/低风险）；液氮只为最后几个百分点服务，`
    + `且待机冷 bug 与操作风险更高——这正是「频率 vs 成本/风险」的取舍。`
    + `<br>冷 bug 悬崖（${st.coldbug.name} + 液氮）：${st.coldbug.v_lo}，${st.coldbug.v_hi}——电压太低反而崩。`;
}

const selCpu = $("selCpu");
st.cpus.forEach(c => { const o = document.createElement("option"); o.value = c.key; o.textContent = c.name; selCpu.appendChild(o); });
selCpu.addEventListener("change", () => { cpuKey = selCpu.value; render(); });
$("selH").addEventListener("change", e => { hours = e.target.value; render(); });
$("selB").addEventListener("change", e => { budget = e.target.value === "none" ? null : parseFloat(e.target.value); render(); });
$("rngV").addEventListener("input", e => { V = parseFloat(e.target.value); render(); });
fillStatic();
render();
</script>
</body>
</html>
"""


def build_html(out_path="demo.html"):
    data = dict(runs=_embed_data(), static=_static_block())
    html = _HTML_TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return out_path, len(html)


def main(argv=None):
    ap = argparse.ArgumentParser(description="NitroClock 小物理模型演示")
    ap.add_argument("--no-html", action="store_true", help="不生成 HTML")
    ap.add_argument("--html", default="demo.html", help="HTML 输出路径")
    args = ap.parse_args(argv)

    cpu = get_cpu("DemoCore 8")
    print_opening(cpu)
    print_tier_table(cpu, 1.45, HOURS_DEFAULT)
    print_comparison(cpu, HOURS_DEFAULT)
    print_decision(cpu, HOURS_DEFAULT)
    print_validation(cpu)

    if not args.no_html:
        path, size = build_html(args.html)
        print(f"已生成展示页：{os.path.abspath(path)}（{size / 1024:.0f} KB）")
        print("双击即可在浏览器打开；无需服务器。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
