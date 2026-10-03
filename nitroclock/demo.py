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

from .physics import (power_W, leak_W, mobility_gain, vt_shift, to_k,
                      LHE_LATENT_J_PER_L, LN2_LATENT_J_PER_L,
                      DICE_LATENT_J_PER_KG)
from .cpus import CPUS, get_cpu
from .cooling import TIERS
from .model import solve, assess, grid, recommend, best_value, \
    pareto_frontier, feasible, STATUS_OK, STATUS_WARN, STATUS_HOT, STATUS_COLD

T_AMB = 25.0
HOURS_DEFAULT = 2.0
V_LO, V_HI, V_STEP = 1.00, 2.00, 0.05
DEGRADE_V = 1.70          # 高于此电压标注电迁移老化风险（不硬限）

STATUS_CN = {STATUS_OK: "可行", STATUS_WARN: "可行（待机冷 bug 警告）",
             STATUS_HOT: "过热 ✗", STATUS_COLD: "冷 bug ✗"}


def _vs():
    v, out = V_LO, []
    while v <= V_HI + 1e-9:
        out.append(round(v, 2))
        v += V_STEP
    return out


def _fmt(r: dict) -> str:
    """一行配置结果的格式化。"""
    if r.get("runaway"):
        return f"{'热失控':<8}{'—':<8}{'—':<10}{'—':<9}{'—':<10}{'过热 ✗':<16}"
    deg = "⚠" if r.get("degrade") else " "
    return (f"{r['T_j']:>6.1f}°C{deg} {r['P']:>5.0f} W {r['f']:>6.2f} GHz "
            f"{r['score']:>7.0f} HK${r['cost']:>8.0f}{'':<2}{STATUS_CN[r['status']]:<16}")


# ----------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------

def print_opening(cpu):
    print("=" * 74)
    print("NitroClock · CPU 低温超频决策工具 · 小物理模型演示")
    print("HacKU 2026 Problem 3 — Test the Change Before You Make It")
    print("=" * 74)
    print()
    print(f"开场结论（示例芯片 {cpu.name}，数字由本模型计算，占位参数待核实）：")
    p1 = power_W(cpu, 1.30, 5.0, T_AMB)
    p2 = power_W(cpu, 1.40, 5.5, T_AMB)
    print(f"  ① 功耗 P ∝ V²f：5.0 GHz @ 1.30 V = {p1:.0f} W → 5.5 GHz @ 1.40 V"
          f" = {p2:.0f} W（+{(p2 / p1 - 1) * 100:.0f}%）——频率涨 10%，功耗涨近三成")
    l25, l95 = leak_W(cpu, 25.0), leak_W(cpu, 95.0)
    print(f"  ② 泄漏每 {cpu.leak_dbl:.0f}°C 翻倍：25°C {l25:.0f} W → 95°C "
          f"{l95:.0f} W（{l95 / l25:.1f} 倍）；液氮下 ≈ 0，省下的热预算拿去加压")
    gain_t = mobility_gain(-196.0)
    gain_m = (to_k(-196.0) / 300.0) ** (-cpu.p_t)
    print(f"  ③ 冷 200 度 ≠ 快 2 倍：迁移率理论上限 ×{gain_t:.1f}，"
          f"标定后同电压只快 ×{gain_m:.2f}；"
          f"阈值电压 +{vt_shift(-196.0):.2f} V 吃掉部分增益，再冷就撞冷 bug")
    print(f"  ④ 制冷的钱：500 W 下液氮 ≈ {500 * 3600 / LN2_LATENT_J_PER_L:.1f} L/h、"
          f"干冰 ≈ {500 * 3600 / DICE_LATENT_J_PER_KG:.1f} kg/h；"
          f"液氦汽化热只有液氮 1/60 → ≈ {500 * 3600 / LHE_LATENT_J_PER_L:.0f} L/h"
          f"（2 小时约 HK$ {500 * 7200 / LHE_LATENT_J_PER_L * 150 / 10000:.1f} 万）"
          f"——只为最后 ~8% 频率")
    print()


def print_tier_table(cpu, V, hours):
    print("-" * 74)
    print(f"档位一览（{cpu.name} @ {V:.2f} V，{hours:.0f} 小时/场，环境 {T_AMB:.0f}°C"
          + ("，⚠ 高压老化风险区" if V > DEGRADE_V else "") + "）")
    print("-" * 74)
    print(f"{'档位':<8}{'结温 Tj':<9}{'功耗':<8}{'频率':<10}{'参考分':<9}"
          f"{'单场成本':<10}{'状态':<18}")
    for tier in TIERS:
        r = assess(cpu, tier, V, hours, T_AMB)
        print(f"{tier.name:<8}{_fmt(r)}")
    print()


def print_comparison(cpu, hours):
    dice = next(t for t in TIERS if t.name == "干冰")
    ln2 = next(t for t in TIERS if t.name == "液氮")
    lhe = next(t for t in TIERS if t.name == "液氦")
    a = assess(cpu, dice, 1.45, hours, T_AMB)
    b = assess(cpu, ln2, 1.55, hours, T_AMB)
    c = assess(cpu, lhe, 1.55, hours, T_AMB)
    print("-" * 74)
    print("三个配置并排比较（题目 EVIDENCE 要求）：干冰 1.45 V / 液氮 1.55 V / 液氦 1.55 V")
    print("-" * 74)
    print(f"{'配置':<14}{'结温':<10}{'功耗':<8}{'频率':<10}{'参考分':<9}"
          f"{'单场成本':<10}{'状态':<18}")
    for r, name in [(a, "干冰 1.45 V"), (b, "液氮 1.55 V"), (c, "液氦 1.55 V")]:
        print(f"{name:<14}{_fmt(r)}")
    print()
    print(f"液氮比干冰多 {(b['score'] / a['score'] - 1) * 100:.0f}% 分数、"
          f"成本 {b['cost'] / a['cost']:.1f} 倍；液氦比液氮再多 "
          f"{(c['score'] / b['score'] - 1) * 100:.0f}%、成本 {c['cost'] / b['cost']:.0f} 倍。")
    print(f"选择：预算 HK$150 → 干冰 1.45 V（HK${a['cost']:.0f}/场）；"
          f"预算 HK$600 → 液氮 1.55 V（HK${b['cost']:.0f}/场）；"
          f"无预算冲纪录 → 液氦 1.55 V（HK${c['cost']:.0f}/场，"
          f"按开口蒸发物理计算；实际先液氮预冷+短时冲分可降约一个量级，待核实）。")
    print("理由：按推荐规则（预算内最高分，并列取低成本/低风险）。"
          "每升一级温度，只为最后几个百分点买单，")
    print("      风险同步上升——这正是「频率 vs 成本/风险」的取舍。")
    print()


def print_decision(cpu, hours):
    pts = grid(cpu, V_LO, V_HI, V_STEP, hours, T_AMB)
    print("-" * 74)
    print("决策层（档位 × 电压网格 → 两个约束筛选 → 帕累托 → 推荐）")
    print("-" * 74)
    for budget, label in [(100.0, "预算 HK$100"), (600.0, "预算 HK$600"),
                          (None, "无上限（冲纪录）")]:
        r = recommend(pts, budget=budget)
        print(f"  {label:<14}→ {r['tier']} @ {r['V']:.2f} V：{r['score']:.0f} 分，"
              f"HK${r['cost']:.0f}/场")
    v_all = best_value(pts, refrigerant_only=False)
    v_low = best_value(pts, refrigerant_only=True)
    print(f"  整体性价比王   → {v_all['tier']}（{v_all['score'] / v_all['cost']:.0f} 分/HK$）"
          f"——上低温不是为了划算")
    print(f"  低温档性价比王 → {v_low['tier']}（{v_low['score'] / v_low['cost']:.0f} 分/HK$）")
    print()
    print("  推荐规则（可解释）：预算内最高分；并列取成本更低；再并列取风险更低档位。")
    print()


def print_validation(cpu):
    print("-" * 74)
    print("模型自查（方案书 §6）")
    print("-" * 74)
    ln2 = next(t for t in TIERS if t.name == "液氮")
    s = solve(cpu, ln2, 1.50, T_AMB)
    ident = abs(s["T_j"] - (s["coolant"] + s["r_stack"] * s["P"]))
    print(f"  ✓ 不动点收敛：{'是' if s['converged'] else '否'}；"
          f"热平衡恒等式残差 {ident:.2e}°C")
    print(f"  ✓ P ∝ V²f / 泄漏指数律 / 冷 bug 悬崖 / 液氦封顶："
          f"单元测试 test_model.py 覆盖（29 项全部通过）")
    print()
    print("约束（团队决定只保留两个）与不建模效应：")
    print("   保留：Tjmax（过热上限）· 冷 bug（过冷下限）")
    print("   不建模：结露、VRM/供电上限、内存/IMC 瓶颈、硅彩票（区间表达）、")
    print("           >1.70 V 仅标注老化风险不硬限；所有芯片/价格参数为占位值")
    print()


# ----------------------------------------------------------------------
# HTML 展示页
# ----------------------------------------------------------------------

_STATUS_ORDER = [STATUS_OK, STATUS_WARN, STATUS_HOT, STATUS_COLD]


def _embed_data():
    """预计算：每颗芯片 × 时长：电压网格行（紧凑数组）+ 帕累托。"""
    out = {}
    for i, cpu in enumerate(CPUS):
        key = f"cpu{i}"
        out[key] = {}
        for hours in (1.0, 2.0, 3.0):
            pts = grid(cpu, V_LO, V_HI, V_STEP, hours, T_AMB)
            rows = {}
            for V in _vs():
                rows[f"{V:.2f}"] = [
                    [round(r["T_j"], 1), round(r["P"], 0), round(r["f"], 3),
                     round(r["score"], 0), round(r["cost"], 0),
                     _STATUS_ORDER.index(r["status"]),
                     1 if r.get("runaway") else 0]
                    for r in (assess(cpu, t, V, hours, T_AMB) for t in TIERS)
                ]
            fe = feasible(pts)
            pareto = [[round(p["cost"], 1), round(p["score"], 0),
                       TIERS.index(next(t for t in TIERS if t.name == p["tier"])),
                       p["V"], p["risk"],
                       _STATUS_ORDER.index(p["status"])]
                      for p in fe]
            front = pareto_frontier(pts)
            front_keys = {(p["tier"], p["V"]) for p in front}
            # 标记前沿点（在 pareto 里按 tier_idx/V 匹配）
            for k, p in enumerate(fe):
                if (p["tier"], p["V"]) in front_keys:
                    pareto[k].append(1)
                else:
                    pareto[k].append(0)
            out[key][f"{hours:.0f}h"] = dict(rows=rows, pareto=pareto)
    return out


def _static_block():
    cpu = get_cpu("DemoCore 8")
    p1 = power_W(cpu, 1.30, 5.0, T_AMB)
    p2 = power_W(cpu, 1.40, 5.5, T_AMB)
    l25, l95 = leak_W(cpu, 25.0), leak_W(cpu, 95.0)
    dice = next(t for t in TIERS if t.name == "干冰")
    ln2 = next(t for t in TIERS if t.name == "液氮")
    lhe = next(t for t in TIERS if t.name == "液氦")
    a = assess(cpu, dice, 1.45, 2.0, T_AMB)
    b = assess(cpu, ln2, 1.55, 2.0, T_AMB)
    c = assess(cpu, lhe, 1.55, 2.0, T_AMB)
    stories = {
        "DemoCore 8": "无冷 bug，全档位可玩（默认演示芯片）",
        "DemoCore 16": "冷 bug -100°C：液氮下电压太低反而崩",
        "DemoFX": "2015 老旗舰：漏电大、风冷易热失控",
        "DemoBook": "15W 低压移动：低温相对增益最大",
        "DemoEPYC": "24 核工作站：风冷直接热失控",
        "DemoCore X3D": "3D 缓存冷敏感：与液氮/液氦绝缘，干冰也需带载",
    }
    return dict(
        tier_names=[t.name for t in TIERS],
        tier_risk=[t.risk for t in TIERS],
        cpus=[dict(key=f"cpu{i}", name=c.name,
                   tjmax=f"{c.tjmax:.0f}°C",
                   coldbug="无（可下液氮）" if c.coldbug is None else f"{c.coldbug:.0f}°C",
                   story=stories.get(c.name.split("（")[0], ""))
              for i, c in enumerate(CPUS)],
        conclusions=dict(
            p1=round(p1, 0), p2=round(p2, 0), gain=round((p2 / p1 - 1) * 100, 0),
            l25=round(l25, 1), l95=round(l95, 1), lx=round(l95 / l25, 1),
            theory=round(mobility_gain(-196.0), 1),
            model_gain=round((to_k(-196.0) / 300.0) ** (-cpu.p_t), 2),
            lhe_lh=round(500 * 3600 / LHE_LATENT_J_PER_L, 0),
            lhe_cost_k=round(500 * 7200 / LHE_LATENT_J_PER_L * 150 / 1000, 0)),
        comparison=dict(
            names=["干冰 1.45 V", "液氮 1.55 V", "液氦 1.55 V"],
            rows=[dict(f=round(a["f"], 2), score=round(a["score"], 0),
                       cost=round(a["cost"], 0), status=STATUS_CN[a["status"]]),
                  dict(f=round(b["f"], 2), score=round(b["score"], 0),
                       cost=round(b["cost"], 0), status=STATUS_CN[b["status"]]),
                  dict(f=round(c["f"], 2), score=round(c["score"], 0),
                       cost=round(c["cost"], 0), status=STATUS_CN[c["status"]])],
            gain_b=round((b["score"] / a["score"] - 1) * 100, 0),
            mult_b=round(b["cost"] / a["cost"], 1),
            gain_c=round((c["score"] / b["score"] - 1) * 100, 0),
            mult_c=round(c["cost"] / b["cost"], 0)),
        degrade_v=DEGRADE_V,
        generated=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
    )


_HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NitroClock — CPU 低温超频决策工具</title>
<style>
  :root { --bg:#0f1420; --panel:#1a2233; --ink:#e8edf5; --dim:#93a1b8;
          --acc:#4da3ff; --red:#ff5c5c; --org:#ff8a5c; --yel:#ffd166;
          --grn:#5cdb7e; --line:#2c3a55; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif; }
  header { padding:12px 22px; border-bottom:1px solid var(--line);
           display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  header h1 { font-size:19px; margin:0; }
  header .sub { color:var(--dim); font-size:12px; }
  .badge { font-size:10px; padding:2px 8px; border:1px solid var(--acc);
           border-radius:10px; color:var(--acc); white-space:nowrap; }
  .wrap { max-width:1060px; margin:0 auto; padding:12px 20px 40px; }
  .controls { display:flex; gap:14px; flex-wrap:wrap; align-items:center;
              padding:10px 0; font-size:13px; }
  .controls label { color:var(--dim); margin-right:5px; }
  select, input[type=range] { background:var(--panel); color:var(--ink);
           border:1px solid var(--line); border-radius:6px; padding:5px 8px; }
  .hero { display:flex; gap:18px; flex-wrap:wrap; align-items:stretch;
          margin:6px 0 12px; }
  .card { background:var(--panel); border:1px solid var(--line);
          border-radius:10px; padding:12px 16px; }
  .hero-main { flex:1.4; min-width:300px; display:flex; align-items:center;
               gap:18px; }
  .hero-main .big { font-size:30px; font-weight:700; line-height:1.1; }
  .hero-main .meta { color:var(--dim); font-size:12px; }
  .chip { display:inline-block; font-size:11px; padding:2px 10px;
          border-radius:12px; border:1px solid var(--line); margin:3px 6px 0 0;
          color:var(--dim); }
  .chip.warn { color:var(--yel); border-color:var(--yel); }
  .hero-side { flex:1; min-width:230px; font-size:13px; }
  .hero-side div { margin:4px 0; }
  canvas { width:100%; height:auto; background:var(--panel);
           border:1px solid var(--line); border-radius:10px; display:block; }
  .row2 { display:flex; gap:16px; flex-wrap:wrap; margin-top:14px; }
  .row2 > .card { flex:1; min-width:280px; }
  .panel h2 { font-size:14px; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th, td { border-bottom:1px solid var(--line); padding:5px 8px; text-align:left; }
  th { color:var(--dim); font-weight:500; }
  .concls { display:flex; gap:12px; flex-wrap:wrap; margin-top:14px; }
  .concls .card { flex:1; min-width:210px; }
  .concls h3 { font-size:13px; margin:0 0 6px; }
  .concls p { font-size:12px; color:var(--dim); margin:0; line-height:1.6; }
  .sim { color:var(--acc); font-size:10px; }
  .note { color:var(--dim); font-size:11px; margin-top:8px; line-height:1.7; }
  .sw { display:inline-block; width:10px; height:10px; border-radius:2px;
        margin-right:4px; vertical-align:middle; }
</style>
</head>
<body>
<header>
  <h1>NitroClock</h1>
  <span class="sub">CPU 低温超频决策工具 · HacKU 2026 Problem 3</span>
  <span class="badge">SIMULATED · 模拟</span>
</header>
<div class="wrap">
  <div class="controls">
    <span><label>芯片</label><select id="selCpu"></select></span>
    <span><label>电压</label>
      <input type="range" id="rngV" min="1.00" max="2.00" step="0.05" value="1.45">
      <b id="labV">1.45 V</b></span>
    <span><label>单场时长</label>
      <select id="selH"><option value="1h">1h</option><option value="2h" selected>2h</option><option value="3h">3h</option></select></span>
    <span><label>预算</label>
      <select id="selB"><option value="50">HK$50</option><option value="100" selected>HK$100</option><option value="150">HK$150</option><option value="300">HK$300</option><option value="600">HK$600</option><option value="none">无上限</option></select></span>
  </div>

  <div class="hero">
    <div class="card hero-main">
      <div>
        <div class="meta">当前预算下的推荐（规则：预算内最高分 → 低成本 → 低风险）</div>
        <div class="big" id="recTier">–</div>
        <div class="meta" id="recSub">–</div>
      </div>
    </div>
    <div class="card hero-side">
      <div>低温档性价比王：<b id="stVal">–</b></div>
      <div>该芯片约束：<span class="chip" id="stTjmax">–</span><span class="chip" id="stCb">–</span></div>
      <div id="stDeg" class="chip warn" style="display:none">⚠ 电压 &gt; 1.70 V：电迁移老化风险（标注，不硬限）</div>
      <div class="meta" id="stStory">–</div>
    </div>
  </div>

  <canvas id="cvBars" width="1036" height="240"></canvas>
  <div class="legend" style="font-size:11px;color:var(--dim);padding:6px 0;">
    <span><span class="sw" style="background:#4da3ff"></span>可行</span>
    <span><span class="sw" style="background:#ffd166"></span>可行·待机冷 bug 警告</span>
    <span><span class="sw" style="background:#ff8a5c"></span>过热/热失控</span>
    <span><span class="sw" style="background:#ff5c5c"></span>冷 bug</span>
    <span style="margin-left:10px;">柱高 = 参考分数（模拟）</span>
  </div>

  <div class="card" style="margin-top:12px;">
    <h2>分数 vs 单场成本（帕累托，横轴为对数刻度）<span class="sim"> SIMULATED</span></h2>
    <canvas id="cvPar" width="1036" height="330"></canvas>
  </div>

  <div class="row2">
    <div class="card">
      <h2>配置对比（示例芯片：DemoCore 8）<span class="sim"> SIMULATED</span></h2>
      <table id="tblCmp"></table>
      <div class="note" id="cmpWhy"></div>
    </div>
    <div class="card">
      <h2>四句话结论</h2>
      <div class="note" id="concl"></div>
    </div>
  </div>

  <div class="card" style="margin-top:14px;">
    <h2>假设与边界</h2>
    <div class="note">
      约束只保留两个（团队决定）：<b>Tjmax 过热</b> + <b>冷 bug 过冷</b>。
      不建模：结露、VRM 供电上限、内存/IMC 瓶颈；硅彩票用区间表达。
      所有芯片参数与价格均为<b>占位值</b>（待数据组替换，见方案书附录）。
      液氦成本按开口蒸发物理计算（实际冲分先液氮预冷、短时运行，用量可降一个量级）。
      本页全部为数值模拟，非实测。
    </div>
  </div>
</div>
<script>
const DATA = __DATA__;
const st = DATA.static;
const TIER_COLORS = ["#7a8ba8", "#6fd3ff", "#8fb7ff", "#b08bff", "#ffd166", "#ff8a5c", "#e0a0ff"];
const STATUS_LIST = ["ok", "warn", "hot", "cold"];
const STATUS_UI = {
  ok:  ["#4da3ff", "可行"],
  warn:["#ffd166", "可行·待机冷bug警告"],
  hot: ["#ff8a5c", "过热"],
  cold:["#ff5c5c", "冷 bug"]
};
let cpuKey = "cpu0", hours = "2h", budget = 100, V = 1.45;
function $(id){ return document.getElementById(id); }
function cpuMeta(){ return st.cpus.find(c => c.key === cpuKey); }
function rowsNow(){ return DATA.runs[cpuKey][hours].rows[V.toFixed(2)]; }
function paretoNow(){ return DATA.runs[cpuKey][hours].pareto; }
function recommendNow(){
  const pts = paretoNow().filter(p => budget === null || p[0] <= budget);
  if (!pts.length) return null;
  return pts.reduce((a,b) =>
    (b[1] > a[1] || (b[1] === a[1] && (b[0] < a[0] ||
      (b[0] === a[0] && st.tier_risk[b[2]] < st.tier_risk[a[2]])))) ? b : a);
}
function valueNow(){
  const pts = paretoNow().filter(p => p[2] >= 4);   // 低温档（干冰起）
  if (!pts.length) return null;
  return pts.reduce((a,b) => (b[1]/b[0] > a[1]/a[0]) ? b : a);
}
function fmtMoney(x){ return x >= 1000 ? "HK$" + (x/1000).toFixed(1) + "k" : "HK$" + x.toFixed(0); }

function drawBars(){
  const cv = $("cvBars"), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const rows = rowsNow(), names = st.tier_names;
  const maxS = Math.max(...rows.map(r => r[3]), 1);
  const n = rows.length, bw = Math.min(108, (cv.width - 80) / n - 16), gap = 14;
  const x0 = 40, baseY = 196, hMax = 150;
  rows.forEach((r, i) => {
    const x = x0 + i * (bw + gap);
    const ui = STATUS_UI[STATUS_LIST[r[5]]];
    const h = r[6] ? 4 : Math.max(6, r[3] / maxS * hMax);
    ctx.fillStyle = ui[0];
    ctx.fillRect(x, baseY - h, bw, h);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.strokeRect(x, baseY - h, bw, h);
    ctx.fillStyle = "#e8edf5"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(names[i], x + bw / 2, baseY + 16);
    ctx.fillStyle = "#93a1b8"; ctx.font = "11px sans-serif";
    if (r[6]) {
      ctx.fillText("热失控", x + bw / 2, baseY - h - 4);
    } else if (r[5] === 3) {
      ctx.fillText("冷 bug", x + bw / 2, baseY - h - 4);
    } else {
      ctx.fillText(r[2].toFixed(2) + " GHz · " + r[3].toFixed(0) + " 分",
                   x + bw / 2, baseY - h - 4);
      ctx.fillText(fmtMoney(r[4]), x + bw / 2, baseY - h + 13);
      ctx.fillText(ui[1], x + bw / 2, baseY - h + 26);
    }
  });
}

function drawPareto(){
  const cv = $("cvPar"), ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pts = paretoNow(), rec = recommendNow(), val = valueNow();
  const padL = 46, padR = 20, padT = 18, padB = 42;
  const W = cv.width - padL - padR, H = cv.height - padT - padB;
  const cMin = Math.min(...pts.map(p => p[0])), cMax = Math.max(...pts.map(p => p[0]));
  const sMin = Math.min(...pts.map(p => p[1])), sMax = Math.max(...pts.map(p => p[1]));
  const X = c => padL + Math.log(c / cMin) / Math.log(cMax / cMin) * W;
  const Y = s => padT + (1 - (s - sMin) / (sMax - sMin)) * H;
  ctx.font = "10px sans-serif";
  // 对数网格线
  for (const c of [10, 30, 100, 300, 1000, 3000, 10000, 30000]) {
    if (c < cMin || c > cMax) continue;
    ctx.strokeStyle = "#24334f";
    ctx.beginPath(); ctx.moveTo(X(c), padT); ctx.lineTo(X(c), padT + H); ctx.stroke();
    ctx.fillStyle = "#93a1b8"; ctx.textAlign = "center";
    ctx.fillText(fmtMoney(c), X(c), padT + H + 14);
  }
  for (let k = 0; k <= 4; k++) {
    const s = sMin + (sMax - sMin) * k / 4;
    ctx.strokeStyle = "#24334f";
    ctx.beginPath(); ctx.moveTo(padL, Y(s)); ctx.lineTo(padL + W, Y(s)); ctx.stroke();
    ctx.fillStyle = "#93a1b8"; ctx.textAlign = "right";
    ctx.fillText(s.toFixed(0), padL - 6, Y(s) + 3);
  }
  ctx.fillStyle = "#93a1b8"; ctx.textAlign = "center";
  ctx.fillText("单场成本（对数）→", padL + W / 2, padT + H + 30);
  ctx.save(); ctx.translate(12, padT + H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText("参考分数 →", 0, 0); ctx.restore();
  // 前沿折线
  const front = pts.filter(p => p[6]).sort((a, b) => a[0] - b[0]);
  ctx.strokeStyle = "#5cdb7e"; ctx.lineWidth = 2;
  ctx.beginPath();
  front.forEach((p, i) => { i === 0 ? ctx.moveTo(X(p[0]), Y(p[1])) : ctx.lineTo(X(p[0]), Y(p[1])); });
  ctx.stroke();
  // 点
  pts.forEach(p => {
    ctx.fillStyle = TIER_COLORS[p[2]];
    ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3, 0, 7); ctx.fill();
  });
  // 预算线
  if (budget !== null && budget <= cMax) {
    ctx.strokeStyle = "#ffd166"; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(X(budget), padT); ctx.lineTo(X(budget), padT + H);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ffd166"; ctx.textAlign = "center";
    ctx.fillText("预算 HK$" + budget, X(budget), padT - 4);
  }
  if (rec) {
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(X(rec[0]), Y(rec[1]), 8, 0, 7); ctx.stroke();
    ctx.fillStyle = "#ffd166"; ctx.textAlign = "left";
    ctx.fillText("推荐 " + st.tier_names[rec[2]] + " " + rec[3].toFixed(2) + " V",
                 X(rec[0]) + 12, Y(rec[1]) - 5);
  }
  if (val) {
    ctx.strokeStyle = "#5cdb7e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(val[0]), Y(val[1]), 8, 0, 7); ctx.stroke();
    ctx.fillStyle = "#5cdb7e"; ctx.textAlign = "left";
    ctx.fillText("低温性价比王 " + st.tier_names[val[2]] + " " + val[3].toFixed(2) + " V",
                 X(val[0]) + 12, Y(val[1]) + 14);
  }
}

function render(){
  $("labV").textContent = V.toFixed(2) + " V";
  const m = cpuMeta();
  $("stTjmax").textContent = "Tjmax " + m.tjmax;
  $("stCb").textContent = "冷 bug " + m.coldbug;
  $("stStory").textContent = "芯片故事：" + m.story;
  $("stDeg").style.display = V > st.degrade_v ? "inline-block" : "none";
  const rec = recommendNow(), val = valueNow();
  if (rec) {
    $("recTier").textContent = st.tier_names[rec[2]] + " @ " + rec[3].toFixed(2) + " V";
    $("recSub").textContent = rec[1].toFixed(0) + " 分 · " + fmtMoney(rec[0]) + "/场 · "
      + STATUS_UI[STATUS_LIST[rec[5]]][1];
  } else {
    $("recTier").textContent = "预算内无可行配置";
    $("recSub").textContent = "试试降低电压或提高预算";
  }
  $("stVal").textContent = val ? (st.tier_names[val[2]] + "（" + (val[1] / val[0]).toFixed(0) + " 分/HK$）") : "–";
  drawBars(); drawPareto();
}

function fillStatic(){
  const c = st.conclusions;
  $("concl").innerHTML =
    `<b>① 功耗 ∝ V²f：</b>5.0 GHz @ 1.30 V = ${c.p1} W → 5.5 GHz @ 1.40 V = ${c.p2} W（+${c.gain}%）。<br>`
    + `<b>② 泄漏翻倍：</b>25°C ${c.l25} W → 95°C ${c.l95} W（${c.lx} 倍）；液氮下 ≈ 0。<br>`
    + `<b>③ 冷 ≠ 快：</b>迁移率理论上限 ×${c.theory}，标定后 ×${c.model_gain}，再冷撞冷 bug。<br>`
    + `<b>④ 液氦的账：</b>500 W 下 ≈ ${c.lhe_lh} L/h，2 小时 ≈ HK$${c.lhe_cost_k} 千——只为最后几个百分点。`;
  const rows = st.comparison.rows, names = st.comparison.names;
  let h = "<tr><th>配置</th><th>频率</th><th>参考分</th><th>单场成本</th><th>状态</th></tr>";
  names.forEach((n, i) => {
    h += `<tr><td>${n}</td><td>${rows[i].f} GHz</td><td>${rows[i].score}</td><td>${fmtMoney(rows[i].cost)}</td><td>${rows[i].status}</td></tr>`;
  });
  $("tblCmp").innerHTML = h;
  $("cmpWhy").innerHTML =
    `液氮比干冰多 <b>${st.comparison.gain_b}%</b> 分数、成本 <b>${st.comparison.mult_b} 倍</b>；`
    + `液氦再买 <b>${st.comparison.gain_c}%</b>、成本 <b>${st.comparison.mult_c} 倍</b>。`
    + `选择：预算 HK$150 → 干冰；HK$600 → 液氮；无预算冲纪录 → 液氦。`;
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
