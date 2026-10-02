"""Run real checks for the UI; no hard-coded passing badges."""
import numpy as np
from engine import Scenario, Task, simulate
from aging import AgingInput, aging, cell_class, make_profile


def run_validation():
    checks = []
    def check(zh, en, passed, detail):
        checks.append(dict(zh=zh, en=en, passed=bool(passed), detail=str(detail)))
    base = Scenario(capacity_wh=100, initial_soc=1, reserve=0, departure_min=0, charge_w=0,
                    tasks=[Task(start=0, end=10, power_w=10)])
    a = simulate(base)
    check("100 Wh / 10 W = 10 小时", "100 Wh / 10 W = 10 hours", abs(a['metrics']['delivered_wh']-100)<1e-6 and a['metrics']['unmet_wh']<1e-6, f"Delivered {a['metrics']['delivered_wh']:.8f} Wh")
    half = base.model_copy(update={"tasks": [Task(start=0,end=5,power_w=10),Task(start=10,end=15,power_w=10)]})
    h = simulate(half)['metrics']
    check("两次 50% 放电 = 1 能量等效循环", "Two 50% discharges = one energy-equivalent cycle", abs(h['energy_cycles']-1)<1e-8, f"{h['energy_cycles']:.8f}")
    mixed = Scenario(capacity_wh=100, initial_soc=.2, window_start=0, window_end=7, departure=7,
                     charge_w=30, tasks=[Task(start=9,end=14,power_w=12)])
    m = simulate(mixed)['metrics']
    relative=abs(m['balance_error_wh'])/max(1,m['grid_wh']+20)
    check("能量守恒（<0.1%）", "Energy conservation (<0.1%)", relative<.001, f"relative error {relative:.3e}")
    finer=simulate(mixed,step_minutes=.25)['metrics']
    errors=[abs(m[k]-finer[k])/max(abs(finer[k]),1e-8) for k in ['grid_wh','delivered_wh','final_soc','charge_hours']]
    check("1 分钟 / 15 秒步长（<1%）", "1-minute / 15-second step (<1%)", max(errors)<.01, f"max relative error {max(errors):.3e}")
    invalid=aging(AgingInput(days=1,temperature_c=0))
    shallow=aging(AgingInput(days=1,lower_soc=.2,upper_soc=.8))
    check("低温／浅循环不生成寿命数字", "Unsupported cold/shallow cycles suppress life numbers", invalid['soh'] is None and shallow['soh'] is None, f"{invalid['status']}; {shallow['status']}")
    config=AgingInput(days=5)
    adapted=aging(config)
    cell=cell_class()()
    for _ in range(config.days):
        t,soc=make_profile(config,float(cell.outputs['q'][-1]))
        cell.update_battery_state(t,soc,np.full_like(t,config.temperature_c))
    err=abs(adapted['soh']-float(cell.outputs['q'][-1]))
    check("与原始 BLAST-Lite 调用一致", "Matches original BLAST-Lite calls", err<1e-12, f"SOH absolute error {err:.3e}; software parity only")
    winter=simulate(base.model_copy(update={"cold_capacity_factor":.9}))['metrics']
    check("冬季可用能量与 SOH 分开", "Winter usable energy separate from SOH", abs(winter['delivered_wh']-90)<1e-6 and base.soh==1, f"{winter['delivered_wh']:.2f} Wh; SOH remains 100%")
    return {"checks":checks,"all_passed":all(c['passed'] for c in checks),"independent_validation":{
        "zh":"独立设备长期实测验证：尚未完成。模型对照只是软件复现；实验依据来自上游拟合研究，不能当成新设备预测精度。",
        "en":"Independent long-term device validation: not completed. Model parity verifies software reproduction; upstream fitted research does not establish prediction accuracy for a new device."}}
