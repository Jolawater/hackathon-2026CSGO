from engine import Scenario, Task

SOURCES = [
    {"id": "winter", "kind": "winterEvidence", "title": "US Department of Energy · Winterizing your EV", "url": "https://www.energy.gov/articles/winterizing-your-electric-vehicle", "zh": "寒冷影响车辆表现，预热和车厢供暖影响续航。本网站 90% 冬季可用容量和 1000 W 汽车取暖仅为敏感性示例，不是此来源测得的通用系数。", "en": "Cold affects vehicle performance; preconditioning and cabin heating affect range. Our 90% winter usable capacity and 1000 W car heating are sensitivity examples, not universal coefficients measured by this source."},
    {"id": "apple15", "kind": "manufacturer", "title": "Apple · iPhone 15 technical specifications", "url": "https://support.apple.com/en-euro/111831", "zh": "视频播放最长 20 小时；为厂商特定测试条件下的声明，不用于推导任意活动功耗。手机预设 15 Wh 是演示假设，不是此页面提供的电池规格。", "en": "Up to 20 hours video playback under Apple's test conditions. Not a mixed-use power calibration. The 15 Wh phone preset is an assumption, not a specification from this page."},
    {"id": "blast", "kind": "published_model", "title": "BLAST-Lite 1.1.0 · battery life model", "url": "https://github.com/NatLabRockies/BLAST-Lite", "zh": "公开实验拟合模型；长期外推、电池包差异及极端条件有局限。运行时使用固定发布版本。", "en": "Model fitted to published cell experiments. Long-term extrapolation, pack differences and extreme conditions have limits. Runtime uses a pinned release."},
    {"id": "b1", "kind": "experimental_reference", "title": "NMC-Gr B1 50Ah · experimental reference", "url": "https://doi.org/10.1016/j.est.2023.109042", "zh": "原模型引用的实验研究。这里复用已发表模型，没有重新获得独立设备实测验证；原始实验数据未捆绑。", "en": "Experimental study cited by the model. We reuse the published fit; this is not independent device validation. Raw experimental data are not bundled."},
    {"id": "b1code", "kind": "model_scope", "title": "B1 source · parameters and experimental limits", "url": "https://github.com/NatLabRockies/BLAST-Lite/blob/main/blast/models/nmc_gr_50Ah_B1_2020.py", "zh": "参考实验范围：循环温度 10–45°C、放电深度 80–100%、最大倍率 1.75C；低温充电采用保守限制。范围内也不等于每种组合均经过独立验证。", "en": "Reference envelope: cycling at 10–45°C, depth 80–100%, maximum 1.75C; conservative cold-charge gate. Being inside the envelope does not validate every combination."}
]


def catalog():
    base = Scenario(tasks=[Task(start=8, end=12, power_w=.8, label="Morning"), Task(start=13, end=18, power_w=1.2, label="Afternoon"), Task(start=19, end=22, power_w=.7, label="Evening")])
    scooter = Scenario(device="scooter", capacity_wh=1500, charge_w=250, initial_soc=.9, target=1, departure_min=.85, window_start=20, window_end=7, distance_km=60, wh_km=20, aux_w=10, tasks=[Task(start=8, end=11, power_w=210, label="Delivery AM"), Task(start=14, end=17, power_w=210, label="Delivery PM")])
    car = Scenario(device="car", capacity_wh=60000, charge_w=7000, initial_soc=.6, trigger=.3, target=.8, departure_min=.6, window_start=22, window_end=7, distance_km=60, wh_km=160, aux_w=500, tasks=[Task(start=8, end=9, power_w=5300, label="Commute AM"), Task(start=18, end=19, power_w=5300, label="Commute PM")])
    return {"presets": {"phone": base.model_dump(), "scooter": scooter.model_dump(), "car": car.model_dump()}, "sources": SOURCES, "preset_status": "assumed", "currency": "HKD", "aging_model": "BLAST-Lite 1.1.0 NMC-Gr B1 50Ah"}
