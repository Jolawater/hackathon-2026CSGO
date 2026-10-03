"""Generate reproducible model validation evidence, not measured rooftop accuracy."""
from datetime import date
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import json
import platform
import time
import numpy as np
import pandas as pd
import pvlib
from backend.model import Inputs, Configuration, evaluate, layout, search, shading_fractions, sun_preview, weather, ROOT, PANEL, MODEL_VERSION

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
record('Configuration-search result','配置搜索結果','Coarse search plus local refinement supplies physically feasible candidates; the owner interface selects highest current NPV, then tests three financial scenarios.','粗搜尋加局部細化提供物理可行配置；業主介面選出當前淨現值最高方案，再測試三個財務情景。',f"feasible={len(s['configs'])}; frontier={len(s['frontier'])}; measured runtime={elapsed:.2f}s",len(s['configs'])>0 and all(r['compliant'] for r in s['configs']))
report={'pvlib_version':pvlib.__version__,'python_version':platform.python_version(),'checks':checks,'baseline':{k:a[k] for k in ['annual_kwh','panels_count','capacity_kw','shading_loss_pct']},'scope':'No measured rooftop or electrical-yield validation has been performed.'}


# Full-year reference pipeline comparisons explicitly distinguish model agreement
# from measured rooftop accuracy. No field-error threshold is invented.
from backend.reliability import reference_case
from backend.screening import ScreeningRequest, SevenInputs, screen, analyse_seven
from backend.calibration import calibration
from scripts.hko_check import calculate
from backend.app import source_metadata
references=[reference_case(Inputs(),Configuration(tilt=tilt,rows=1)) for tilt in [0,20,40]]
assert all(r['reference_kwh']>0 and np.isfinite(r['difference_pct']) for r in references)
record('Whole-generation reference pipeline','完整發電流程參考核對',
       'Three unobstructed single-row cases against ModelChain/PVWatts using identical weather/capacity. Temperature, losses and inverter assumptions differ. This is cross-model evidence, not measured accuracy.',
       '三個無遮擋單排案例與同氣象／容量的 ModelChain/PVWatts 比較。溫度、損失及逆變器假設不同，屬模型核對，並非實測準確率。',
       '; '.join(f"tilt={r['configuration']['tilt']}°: difference={r['difference_pct']}%" for r in references),True,references[0]['source_url'])
late=screen(ScreeningRequest(inputs=SevenInputs(commissioning_month='2032-01')))
record('Decision can reject installation','決策可建議暫緩安裝',
       '2032 commissioning: a physically feasible candidate remains visible, but all three NPV scenarios are non-positive.',
       '2032 年投產：保留物理可行的候選配置，但三個淨現值情景均不為正。',
       f"candidate={late['result']['capacity_kw']} kW; NPV upper={late['interval']['max']}; verdict={late['verdict']}",
       late['result']['compliant'] and late['interval']['max']<=0 and late['verdict']=='not_recommended')
analysis=analyse_seven(ScreeningRequest())
record('Historical weather and sensitivity coverage','歷史氣象及敏感性覆蓋',
       'Nine one-at-a-time scenarios for the recommended configuration, with separate searches for recommendation changes. The NPV range is three deterministic points, not a confidence bound.',
       '當前推薦配置的九個單項情景，另行搜尋配置是否改變。淨現值範圍來自三個確定情景，並非置信區間。',
       f"scenarios={len(analysis['scenarios'])}; NPV points={analysis['interval']['points']}",
       len(analysis['scenarios'])==9 and len(analysis['interval']['points'])==3)
radiation=calculate()
record('Independent irradiance input comparison','獨立輻照輸入比較',
       "King's Park daily MJ/m² / 3.6 versus bundled NASA hourly annual totals, for 2023–25. Incomplete daily observations remain flagged; no rooftop generation accuracy is claimed.",
       '京士柏每日 MJ/m² 除以 3.6，與 NASA 逐時全年總量比較（2023–25 年）。不完整日數保留標記，不聲稱已驗證天台發電準確率。',
       '; '.join(f"{r['year']}: HKO/NASA={r['ratio']:.6f}, flagged={len(r['flagged_days'])}" for r in radiation['years']),
       radiation==calibration() and all(.9<r['ratio']<1 for r in radiation['years']),radiation['source_url'])
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
owner_screen=screen(ScreeningRequest())
owner_finance=evaluate(Inputs(**owner_screen['mapped_inputs']),Configuration(**owner_screen['result']['config']))
after_cutoff=[p['A'] for p in owner_finance['cashflow'] if p['date']>='2033-12-31']
replacement_index=next(i for i,p in enumerate(owner_finance['cashflow']) if p['date']=='2037-01-31')
record('Conservative shutdown after FiT','上網電價後停用的保守情景',
       'A has no income, maintenance or inverter replacement after FiT. B continues self-use and operating costs. Values are simulated under the labelled default assumptions.',
       'A 在上網電價結束後沒有收入、維護或逆變器更換；B 繼續自用及付運作費。數值按已標示的預設假設模擬。',
       f"NPV A={owner_finance['npv_A']}; quote/kW={owner_finance['max_acceptable_per_kw_A']}; conclusion={owner_screen['verdict']}",
       len(set(after_cutoff))==1 and owner_finance['cashflow'][replacement_index]['B']<owner_finance['cashflow'][replacement_index-1]['B'] and owner_screen['verdict']=='marginal')
from scripts.hko_check import compare_monthly
monthly_comparison=compare_monthly(owner_finance['monthly_kwh'],2025,radiation)
record('Monthly seasonality versus HKO','月度季節形狀與天文台對比',
       'Pearson correlation: model PV generation versus independently observed monthly irradiance. Checks seasonal shape, not measured electrical accuracy.',
       '模型發電與獨立實測月度輻照的 Pearson 相關系數；核對季節形狀，並非實測發電準確率。',
       f"2025: r={monthly_comparison['pearson_r']:.6f}; 12 months", .95<monthly_comparison['pearson_r']<.98,radiation['source_url'])
sun_path=owner_screen['sun_path']
noon=sun_preview(Inputs(**owner_screen['mapped_inputs']),Configuration(**owner_screen['result']['config']),date(2025,12,21),12)
record('Five-minute winter-solstice preview','五分鐘冬至日照預覽',
       '145 pvlib samples from 06:00 to 18:00 HK time. Noon shade and beam visibility match the evaluation preview; highlights use the nearest sample, not shadow-map pixels.',
       '香港時間 06:00 至 18:00 共 145 個 pvlib 樣本。正午遮擋及直射光可見性與評估預覽一致；高亮採用最近模型樣本，並非陰影貼圖像素。',
       f"samples={len(sun_path)}; noon shaded={noon['shaded_panels']}/{owner_finance['panels_count']}",
       len(sun_path)==145 and {k:v for k,v in sun_path[72].items() if k!='hour'}==noon)
report.update(monthly_comparison=monthly_comparison,model_version=MODEL_VERSION,checks=checks,references=references,weather_years=source_metadata()['weather_years'],
              sensitivity=analysis,calibration=radiation,scope='Cross-model consistency and scenario analysis only. No measured rooftop accuracy, probability or P90 claim.')
temporary=ROOT/'data/validation.json.tmp'
temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2))
temporary.replace(ROOT/'data/validation.json')
print(f"PASS: {len(checks)} checks, {len(references)} annual reference cases, three weather years.")
