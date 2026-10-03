"""Generate reproducible model validation evidence, not measured rooftop accuracy."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
import platform
import time
import numpy as np
import pandas as pd
import pvlib
from backend.model import Inputs, Configuration, evaluate, layout, search, shading_fractions, weather, ROOT, PANEL

checks=[]
def record(en,zh,en_description,zh_description,observed,condition,source=None):
    if not condition:raise AssertionError(f'Validation failed: {en}: {observed}')
    checks.append({'name_en':en,'name_zh':zh,'description_en':en_description,'description_zh':zh_description,'observed':observed,'passed':True,'source_url':source})

p=pvlib.solarposition.spa_python(pd.DatetimeIndex(['2003-10-17T12:30:30-07:00']),39.742476,-105.1786,altitude=1830,pressure=82000,temperature=11,delta_t=67)
zen_error=abs(float(p.apparent_zenith.iloc[0])-50.111622);az_error=abs(float(p.azimuth.iloc[0])-194.340241)
record('Published solar-position benchmark','已發表太陽位置基準','NREL SPA report example: 17 Oct 2003, Colorado. Required angular error < 0.00001°.','NREL SPA 報告的 2003 年 10 月 17 日科羅拉多參考案例，要求角度誤差小於 0.00001°。',f'zenith error={zen_error:.8f}°, azimuth error={az_error:.8f}°',max(zen_error,az_error)<1e-5,'https://www.nrel.gov/docs/fy08osti/34302.pdf')
errors=[]
for alt in [5,10,20,40,75]:
    for az in [100,135,180,220,260]:
        ref=float(pvlib.shading.shaded_fraction1d(solar_zenith=90-alt,solar_azimuth=az,axis_azimuth=90,shaded_row_rotation=30,collector_width=PANEL['length_m'],pitch=3,axis_tilt=0,surface_to_axis_offset=0,cross_axis_slope=0))
        own=shading_fractions([alt],[az],30,180,[{'y':3,'count':1},{'y':0,'count':1}])[1,0]
        errors.append(abs(ref-own))
record('Row-shadow geometry cross-check','排間陰影幾何交叉核對','Our ray/plane formula versus pvlib in 25 fixed-tilt cases. This checks implementation consistency, not real module electrical losses.','自建光線與面板交點公式，對照 pvlib 的 25 個固定傾角案例。這是實作一致性檢查，並非實際面板電損驗證。',f'25 cases; max shade-fraction difference={max(errors):.2e}',max(errors)<1e-9,'https://pvlib-python.readthedocs.io/en/v0.15.2/reference/generated/pvlib.shading.shaded_fraction1d.html')
w=weather()
record('Hourly weather integrity','逐小時气象資料完整性','Hourly means, UTC converted to Hong Kong time. Negative fill values rejected during download.','逐小時平均資料由 UTC 轉為香港時間，下載時拒絕缺失值。',f"hours={len(w['ghi'])}; night irradiance={float(w['ghi'][w['altitude']<=0].sum()):.1f}",len(w['ghi'])==8760 and np.isfinite(w['ghi']).all() and w['ghi'][w['altitude']<=0].sum()==0)
a=evaluate(Inputs(),Configuration());b=evaluate(Inputs(horizon=[40]*12),Configuration())
record('Shading relationship','遮擋關係','Identical layout with a 0° versus 40° surrounding horizon. More obstruction must reduce annual output.','相同排布，周圍天際線分別設為 0° 與 40°；增加遮擋應令全年發電量下降。',f"clear={a['annual_kwh']} kWh; obstructed={b['annual_kwh']} kWh",0<b['annual_kwh']<a['annual_kwh'])
record('Monthly energy accounting','每月能量加總','Sum of rounded monthly generation must match the annual total within 0.12 kWh.','四捨五入後的月發電量總和，與全年發電量相差應少於 0.12 kWh。',f"monthly sum={sum(a['monthly_kwh']):.2f}; annual={a['annual_kwh']}",abs(sum(a['monthly_kwh'])-a['annual_kwh'])<.12)
start=time.perf_counter();s=search(Inputs());elapsed=time.perf_counter()-start
record('Configuration-search result','配置搜索結果','Coarse search plus local refinement; only physically feasible configurations meeting decision goals enter recommendations.','粗搜尋加局部細化，只有物理可行且符合決策目標的配置才可推薦。',f"feasible={len(s['configs'])}; frontier={len(s['frontier'])}; measured runtime={elapsed:.2f}s",len(s['configs'])>0 and all(r['compliant'] for r in s['configs']))
report={'pvlib_version':pvlib.__version__,'python_version':platform.python_version(),'checks':checks,'baseline':{k:a[k] for k in ['annual_kwh','panels_count','capacity_kw','shading_loss_pct']},'scope':'No measured rooftop or electrical-yield validation has been performed.'}


# Full-year reference pipeline comparisons explicitly distinguish model agreement
# from measured rooftop accuracy. No field-error threshold is invented.
from backend.reliability import reference_case, analyse
from backend.app import source_metadata
references=[reference_case(Inputs(),Configuration(tilt=tilt,rows=1)) for tilt in [0,20,40]]
assert all(r['reference_kwh']>0 and np.isfinite(r['difference_pct']) for r in references)
record('Whole-generation reference pipeline','完整發電流程參考核對',
       'Three unobstructed single-row cases against ModelChain/PVWatts using identical weather/capacity. Temperature, losses and inverter assumptions differ. This is cross-model evidence, not measured accuracy.',
       '三個無遮擋單排案例與同氣象／容量的 ModelChain/PVWatts 比較。溫度、損失及逆變器假設不同，屬模型核對，並非實測準確率。',
       '; '.join(f"tilt={r['configuration']['tilt']}°: difference={r['difference_pct']}%" for r in references),True,references[0]['source_url'])
late=search(Inputs(commissioning='2032-01-01'))
record('Decision can reject installation','決策可建議暫緩安裝',
       '2032 commissioning, default conservative income: physically feasible options remain, but none meet positive-value/payback goals. No-install solar baseline is zero.',
       '2032 年投產及預設保守收入下，仍有物理可行方案，但沒有方案符合正收益與回本目標；不安裝基準為零。',
       f"feasible={len(late['configs'])}; eligible={late['eligible_count']}; verdict={late['verdict']}",late['eligible_count']==0 and late['verdict']=='defer_installation')
analysis=analyse(Inputs(),Configuration())
record('Historical weather and sensitivity coverage','歷史氣象及敏感性覆蓋',
       'Three weather years (2024 includes 8,784 hours), twelve one-at-a-time scenarios and eight recommendation scenarios. Ranges are not confidence bounds.',
       '三個氣象年份（2024 年為 8,784 小時）、十二個單項情景及八個推薦情景；範圍並非置信區間。',
       f"annual scenario envelope={analysis['range']['annual_kwh']}; distinct choices={analysis['distinct_recommendations']}",len(analysis['weather_years'])==3 and len(analysis['scenarios'])==12)
from backend.reference import irradiance_check
radiation=irradiance_check()
record('Independent irradiance input comparison','獨立輻照輸入比較',
       "NASA POWER 2025 versus HKO King's Park 2025 observations. Different location/calendar boundaries; no calibrated PV accuracy claim.",
       'NASA POWER 2025 與天文台京士柏同年觀測對照；地點及曆年邊界不同，不宣稱已校準發電準確率。',
       f"NASA={radiation['nasa_annual_kwh_m2']} kWh/m²; HKO={radiation['same_year']['hko_annual_kwh_m2']} kWh/m²; difference={radiation['same_year']['difference_pct']}%",
       np.isfinite(radiation['same_year']['difference_pct']),radiation['same_year']['source_url'])
record('Boundary and rotated packing regressions','邊界及旋轉排板回歸',
       '8 x 7 m, two rows, 0–40° every 5° retains 12 modules; 150° two rows retains at least 9 complete non-overlapping modules.',
       '8 x 7 m、兩排、0–40° 每 5° 均保留 12 塊；150° 兩排至少保留 9 塊完整且不重疊面板。',
       '9 tilt cases; rotated two-row case',
       all(len(layout(Inputs(width=8,depth=7),Configuration(tilt=t,rows=2))[0])==12 for t in range(0,41,5)) and len(layout(Inputs(width=8,depth=7),Configuration(tilt=20,azimuth=150,rows=2))[0])>=9)
presets=json.loads((ROOT/'data/roof_presets.json').read_text())
village=Inputs(width=8.06,depth=8.06,house_area=65)
compact=evaluate(village,Configuration(tilt=40,rows=3,layout_mode='compact'))
record('Coverage-limited village packing with access','村屋覆蓋限制及檢修間隙',
       'Assumed 65 m² roof: 18 reference modules at 40° with at least the assumed 0.3 m horizontal gap; actual hull <=32.5 m².',
       '假設 65 m² 天台，40° 的 18 塊參考面板；水平間隙至少為假設的 0.3 m，實際凸包面積不超過 32.5 m²。',
       f"rows={compact['actual_rows']}; modules={compact['panels_count']}; hull={compact['coverage_m2']} m²; gap={compact['minimum_clear_gap_m']} m",
       compact['compliant'] and compact['panels_count']==18 and compact['minimum_clear_gap_m']>=.3-1e-4)
record('Village example dimensions and scope','村屋示例尺寸及適用範圍',
       'Illustrative roofs fall within the source-backed 65.03 m² covered-area size limit, not a full legal or structural certification.',
       '示例尺寸在有來源的 65.03 m² 有蓋面積上限內；並非完整合法性或結構認證。',
       '; '.join(f"{p['id']}: {p['inputs']['house_area']} m²" for p in presets['presets']),
       all(p['inputs']['house_area']<=65.03 for p in presets['presets']),presets['source_url'])
report.update(model_version='2.2.0',checks=checks,references=references,weather_years=source_metadata()['weather_years'],
              sensitivity=analysis,irradiance_check=radiation,scope='Cross-model consistency and scenario analysis only. No measured rooftop accuracy, probability or P90 claim.')
temporary=ROOT/'data/validation.json.tmp'
from datetime import datetime, timezone
from backend.validation_status import fingerprints
report.update(generated_at=datetime.now(timezone.utc).isoformat(), input_sha256=fingerprints(ROOT))
temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2), encoding='utf-8')
temporary.replace(ROOT/'data/validation.json')
print(f"PASS: {len(checks)} checks, {len(references)} annual reference cases, three weather years.")
