from cold import cold_factor
from engine import Scenario, Task

SOURCES = [
    {"id":"regional_climate","kind":"climate_reference","title":"NASA POWER / MERRA-2 · monthly climatology 2001–2020","url":"https://power.larc.nasa.gov/docs/services/api/temporal/climatology/","zh":"新加坡、香港、赫尔辛基坐标附近的网格月均 2 米气温与相对湿度，非站点实测、当前天气或电芯温度。每个地点的 API 请求和时间范围随数据保存；纬度不直接产生电池损耗系数。","en":"Gridded monthly mean 2 m air temperature and humidity near Singapore, Hong Kong and Helsinki coordinates; not station observations, current weather or cell temperature. Source requests and period are bundled. Latitude creates no direct degradation multiplier."},
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
    # Needs change actual demand and opportunities, not just a display label.
    heavy = base.model_copy(update={"target":1., "reserve":.15, "priority":"reserve", "tasks":[Task(start=8,end=12,power_w=1),Task(start=13,end=18,power_w=1.5),Task(start=19,end=22,power_w=3)]})
    short = base.model_copy(update={"window_start":7, "window_end":7.5, "target":.8, "departure_min":.6, "initial_soc":.3})
    night = scooter.model_copy(update={"distance_km":40, "window_start":10,"window_end":16,"departure":18,"departure_min":.8,"tasks":[Task(start=18,end=22,power_w=210)]})
    limited = commute.model_copy(update={"initial_soc":.3,"window_start":6,"window_end":7,"target":.8,"departure_min":.6})
    long_trip = car.model_copy(update={"distance_km":250,"target":1.,"reserve":.15,"priority":"reserve","departure_min":.9,"tasks":[Task(start=8,end=10,power_w=10500),Task(start=17,end=19,power_w=10500)]})
    public = car.model_copy(update={"initial_soc":.3,"window_start":19,"window_end":20,"departure_min":.25,"target":.8,"priority":"interruptions"})
    add("phone-heavy",heavy,["重度使用，优先够用","Heavy use · energy first"],["游戏、视频与工作并用的人","People mixing gaming, video and work"],["即使充满，晚间高负载是否还会缺电？","Can evening heavy use exhaust even a full charge?"],["任务缺电、备用电量、需要增加的补电","Unserved demand, reserve and extra charging"])
    add("phone-short-window",short,["出门前只有半小时","Only 30 minutes before leaving"],["忘记夜间充电的人","People who missed overnight charging"],["07:00–07:30 补电，能否撑过一天？","Can a 07:00–07:30 top-up cover the day?"],["出发电量、充电功率与可用时间","Departure SOC, charging power and time"])
    add("scooter-night",night,["夜班工作，白天充电","Night work · daytime charging"],["晚间配送或夜班工作者","Evening delivery and night-shift workers"],["白天补电后，能否完成晚间 40 km 工作？","Can daytime charging cover a 40 km evening shift?"],["18:00 出发电量、任务完成、备用里程","18:00 departure SOC, completion and reserve range"])
    add("scooter-short-window",limited,["低电出门，补电机会少","Low start · limited charging"],["每天仅一小时可以充电的通勤者","Commuters with a one-hour charging window"],["06:00–07:00 补电够不够往返 20 km？","Can a 06:00–07:00 charge cover a 20 km return trip?"],["时间约束、最低余量、是否需要改变安排","Time limits, minimum reserve and schedule changes"])
    add("car-long-trip",long_trip,["长途探亲，保留余量","Long trip · keep a reserve"],["计划一天往返 250 km 的车主","Drivers planning a 250 km return day trip"],["夜间充满后，能否往返并留下 15%？","Can overnight charging cover the trip with 15% left?"],["任务完成、充电时间、备用续航","Completion, charging time and remaining range"])
    add("car-public-charge",public,["无家充，固定一小时补电","No home charger · one-hour top-up"],["每天只能使用公共慢充的通勤者","Commuters relying on public AC charging"],["每天 19:00–20:00 补电，能持续满足通勤吗？","Can a daily 19:00–20:00 charge sustain commuting?"],["连续七天缺电、补电时间与次数","Seven-day shortages, charging time and sessions"])
    scenarios[-1]["parameters"]["days"] = 7
    guidance = {
        "phone-student": ("先保证晚间联系，再减少白天补电。提高上限会增加充电时间。", "Keep evening contact available, then reduce daytime top-ups. Higher targets add charging time."),
        "phone-travel": ("优先全天够用；仅提高上限可能仍不够，需要降低负载或增加补电。", "Prioritize a full day out. A higher target alone may not suffice; reduce demand or add charging."),
        "phone-heavy": ("先看任务能否完成；100% 是测试起点，不保证重度使用够用。", "Check task completion first. A 100% target is a starting test, not a guarantee."),
        "phone-short-window": ("先检验半小时的硬限制；更高充电上限不能弥补充电时间不足。", "Test the 30-minute limit first. A higher target cannot make up for too little charging time."),
        "scooter-commute": ("以往返任务和备用里程为先，再减少充电时间。", "Cover the return journey and reserve before reducing charging time."),
        "scooter-delivery": ("优先完成配送；少补电与更大的工作余量可能冲突。", "Finish deliveries first; fewer stops may conflict with working reserve."),
        "scooter-night": ("充电窗口随工作班次改变；不能套用夜间充电的通勤预设。", "Fit charging around the shift; overnight commuter charging does not fit this schedule."),
        "scooter-short-window": ("先检查低起始电量与短窗口；可能需要更早补电。", "Check the low initial charge and short window; earlier charging may be needed."),
        "car-commute": ("满足次日往返后比较充电时间和余量，不默认每天充满。", "After covering tomorrow's commute, compare charging time and reserve without assuming a full charge."),
        "car-winter": ("分别计入参考低温影响与取暖；结果不能当成该品牌冬季实测。", "Account for reference cold effects and heating separately; this is not a branded winter test."),
        "car-long-trip": ("以完成长途和 15% 备用为先，接受更长的夜间充电。", "Prioritize the long trip and 15% reserve, accepting longer overnight charging."),
        "car-public-charge": ("连续七天检验补入能量是否赶得上用电；第一天够用不代表长期可行。", "Test seven days of energy replenishment; a successful first day does not prove sustainability."),
    }
    for item in scenarios:
        item["guidance"] = dict(zip(["zh","en"], guidance[item["id"]]))
    return {"presets": {"phone": base.model_dump(), "scooter": scooter.model_dump(), "car": car.model_dump()}, "scenarios":scenarios, "sources": SOURCES, "preset_status": "assumed", "currency": "HKD", "aging_model": "BLAST-Lite 1.1.0 NMC-Gr B1 50Ah"}
