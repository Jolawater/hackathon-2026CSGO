from cold import cold_factor
from engine import Scenario, Task

SOURCES = [
    {"id":"p28a","kind":"manufacturer","title":"Molicel INR-18650-P28A · temperature curves v1.3","url":"https://www.molicel.com/wp-content/uploads/INR18650P28A_1.3_Product-Data-Sheet-of-INR-18650-P28A-80093.pdf","zh":"23°C 充至 4.2 V；2.8 A 放电至 2.5 V。厂商矢量曲线积分，0°C 约为 23°C 能量的 92.5%，−20°C 约 84.4%。温度点间线性插值；超过 23°C 不增加额定能量。参考电芯迁移不是手机或整车实测，动态低温限制是简化假设。","en":"Charged at 23°C to 4.2 V; discharged at 2.8 A to 2.5 V. Integrated manufacturer vector curves: about 92.5% of 23°C energy at 0°C, 84.4% at −20°C. Linear interpolation; no rated-energy gain above 23°C. Reference-cell transfer is not phone or vehicle measurement; dynamic cold restriction is a simplifying assumption."},
    {"id": "winter", "kind": "winterEvidence", "title": "US Department of Energy · Winterizing your EV", "url": "https://www.energy.gov/articles/winterizing-your-electric-vehicle", "zh": "寒冷影响车辆表现，预热和车厢供暖影响续航。取暖功率 1000 W 为可编辑假设；低温能量采用独立 P28A 参考曲线，不是此来源提供的整车系数。", "en": "Cold affects vehicle performance; preconditioning and cabin heating affect range. 1000 W heating is editable and assumed. Cold energy uses separate P28A reference curves, not a vehicle coefficient from this source."},
    {"id": "apple15", "kind": "manufacturer", "title": "Apple · iPhone 15 technical specifications", "url": "https://support.apple.com/en-euro/111831", "zh": "视频播放最长 20 小时；为厂商特定测试条件下的声明，不用于推导任意活动功耗。手机预设 15 Wh 是演示假设，不是此页面提供的电池规格。", "en": "Up to 20 hours video playback under Apple's test conditions. Not a mixed-use power calibration. The 15 Wh phone preset is an assumption, not a specification from this page."},
    {"id": "blast", "kind": "published_model", "title": "BLAST-Lite 1.1.0 · battery life model", "url": "https://github.com/NatLabRockies/BLAST-Lite", "zh": "公开实验拟合模型；长期外推、电池包差异及极端条件有局限。运行时使用固定发布版本。", "en": "Model fitted to published cell experiments. Long-term extrapolation, pack differences and extreme conditions have limits. Runtime uses a pinned release."},
    {"id": "b1", "kind": "experimental_reference", "title": "NMC-Gr B1 50Ah · experimental reference", "url": "https://doi.org/10.1016/j.est.2023.109042", "zh": "原模型引用的实验研究。这里复用已发表模型，没有重新获得独立设备实测验证；原始实验数据未捆绑。", "en": "Experimental study cited by the model. We reuse the published fit; this is not independent device validation. Raw experimental data are not bundled."},
    {"id": "b1code", "kind": "model_scope", "title": "B1 source · parameters and experimental limits", "url": "https://github.com/NatLabRockies/BLAST-Lite/blob/main/blast/models/nmc_gr_50Ah_B1_2020.py", "zh": "参考实验范围：循环温度 10–45°C、放电深度 80–100%、最大倍率 1.75C；低温充电采用保守限制。范围内也不等于每种组合均经过独立验证。", "en": "Reference envelope: cycling at 10–45°C, depth 80–100%, maximum 1.75C; conservative cold-charge gate. Being inside the envelope does not validate every combination."}
]


def catalog():
    base = Scenario(tasks=[Task(start=8, end=12, power_w=.8, label="Morning"), Task(start=13, end=18, power_w=1.2, label="Afternoon"), Task(start=19, end=22, power_w=.7, label="Evening")])
    scooter = Scenario(device="scooter", capacity_wh=1500, charge_w=250, initial_soc=.9, target=1, departure_min=.85, window_start=20, window_end=7, distance_km=60, wh_km=20, aux_w=10, tasks=[Task(start=8, end=11, power_w=210, label="Delivery AM"), Task(start=14, end=17, power_w=210, label="Delivery PM")])
    car = Scenario(device="car", capacity_wh=60000, charge_w=7000, initial_soc=.6, trigger=.3, target=.8, departure_min=.6, window_start=22, window_end=7, distance_km=60, wh_km=160, aux_w=500, tasks=[Task(start=8, end=9, power_w=5300, label="Commute AM"), Task(start=18, end=19, power_w=5300, label="Commute PM")])
    travel = base.model_copy(update={"tasks": [Task(start=8,end=12,power_w=1.5),Task(start=13,end=18,power_w=1.8),Task(start=19,end=22,power_w=1)]})
    commute = scooter.model_copy(update={"distance_km":20,"tasks":[Task(start=8,end=9,power_w=210),Task(start=18,end=19,power_w=210)]})
    winter = car.model_copy(update={"ambient_c":5,"cold_capacity_factor":cold_factor(5),"cold_mode":"reference_cell","heating_w":1000})
    scenarios = []
    def add(id, config, title, audience, problem, focus):
        parameters = config.model_copy(update={"scenario_id":id}).model_dump()
        scenarios.append({"id":id,"device":config.device,"parameters":parameters,"status":"assumed",
                          **{key:dict(zip(["zh","en"],value)) for key,value in dict(title=title,audience=audience,problem=problem,focus=focus).items()}})
    add("phone-student",base,["学生上课与通勤","Classes & commuting"],["学生、白天不方便充电的人","Students with limited daytime charging"],["晚上是否还够联系和导航？","Enough energy left for evening contact and navigation?"],["最低电量、备用线、出发电量","Minimum SOC, reserve and departure SOC"])
    add("phone-travel",travel,["旅行与长时间外出","Travel & long days out"],["经常导航、拍照的出行者","Travelers using navigation and photography"],["使用增加后，原来的充电上限还够吗？","Does your usual charge limit cover heavier use?"],["缺电时段、额外补电时间","Unserved demand and additional charging time"])
    add("scooter-commute",commute,["日常上下班","Everyday commute"],["骑电单车上下班的人","Electric two-wheeler commuters"],["夜间充电能否覆盖往返，并留下备用电量？","Can overnight charging cover a return trip plus reserve?"],["往返任务、剩余里程、充电时间","Trip completion, remaining range and charging time"])
    add("scooter-delivery",scooter,["外卖配送","Delivery shift"],["长时间骑行的配送人员","Delivery riders working long shifts"],["少充几次电，会不会影响后半天配送？","Would fewer charging stops disrupt later deliveries?"],["任务缺电、充电次数、备用余量","Task failures, charge sessions and reserve"])
    add("car-commute",car,["日常通勤","Daily driving"],["有夜间充电窗口的车主","Drivers with overnight charging access"],["充到多少能满足第二天往返？","What charge target covers tomorrow's return trip?"],["出发电量、充电时间、费用","Departure SOC, charging time and cost"])
    add("car-winter",winter,["冬季出行","Winter driving"],["寒冷天气需要车内取暖的车主","Drivers needing cabin heating in cold weather"],["可用容量减少、取暖增加后，原方案还可行吗？","Does the plan work with less usable capacity and added heating?"],["满电可用能量、取暖需求、是否够用","Usable full-charge energy, heating demand and feasibility"])
    return {"presets": {"phone": base.model_dump(), "scooter": scooter.model_dump(), "car": car.model_dump()}, "scenarios":scenarios, "sources": SOURCES, "preset_status": "assumed", "currency": "HKD", "aging_model": "BLAST-Lite 1.1.0 NMC-Gr B1 50Ah"}
