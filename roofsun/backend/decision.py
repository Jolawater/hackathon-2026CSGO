"""Budget-aware Pareto choices, including the choice not to install."""
from functools import lru_cache
import json
import time
from .model import Inputs, Configuration, evaluate, finance, PANEL, MODEL_VERSION, layout

PHYSICAL_KEYS = ('width','depth','roof_rotation','house_area','horizon','weather_year','weather_scale',
                 'extra_mass_per_module','load_limit','finite_rows','electrical_model','bypass_blocks','exclusions','minimum_row_fill_ratio','minimum_access_gap_m')


def assess(inputs, result):
    scenario = 'B' if inputs.post_fit else 'A'
    reasons=[]
    if not result['compliant']: reasons.append('physical')
    if result['capacity_kw'] < inputs.minimum_capacity_kw: reasons.append('minimum_capacity')
    if inputs.budget and result['initial_cost'] > inputs.budget: reasons.append('budget')
    if inputs.require_profit and (result[f'net_{scenario}'] <= 0 or result[f'npv_{scenario}'] <= 0): reasons.append('profit')
    years=result[f'payback_years_{scenario}']
    if inputs.max_payback_years and (years is None or years > inputs.max_payback_years): reasons.append('payback')
    return {'eligible': not reasons, 'reasons': reasons, 'scenario': scenario,
            'status': 'meets_goals' if not reasons else 'does_not_meet_goals'}


def pareto(results):
    best=-1;out=[]
    for r in sorted(results,key=lambda r:(r['initial_cost'],-r['annual_kwh'])):
        if r['annual_kwh'] > best + 1e-6:
            out.append(r);best=r['annual_kwh']
    return out


@lru_cache(maxsize=16)
def physical_search(serialized):
    inputs=Inputs.model_validate_json(serialized)
    rows_limit=min(24,max(6,int((max(inputs.width,inputs.depth)-1)/
                   (PANEL['length_m']*0.766))))
    results=[];seen=set();built=set()
    def test(tilt,azimuth,rows,panel_limit=0,layout_mode='spread'):
        key=(tilt,azimuth,rows,panel_limit,layout_mode)
        if key in seen:return
        seen.add(key)
        result=evaluate(inputs,Configuration(tilt=tilt,azimuth=azimuth,rows=rows,panel_limit=panel_limit,layout_mode=layout_mode),False,economics=False)
        if result['panels_count'] and result['compliant']:
            panels,actual_rows,_,_=layout(inputs,Configuration(**result['config']))
            signature=(tilt,azimuth,result['actual_rows'],result['panels_count'],tuple((round(r['y'],8),tuple((round(a,8),round(b,8)) for a,b in r['intervals'])) for r in actual_rows))
            if signature not in built:results.append(result);built.add(signature)
        if not panel_limit and result['panels_count']>22:test(tilt,azimuth,rows,22,layout_mode)
    for tilt in [0,10,20,30,40]:
        for az in [90,120,150,180,210,240,270]:
            for rows in range(1,rows_limit+1):
                for mode in ['spread','compact']:test(tilt,az,rows,layout_mode=mode)
    # Refine directions/tilts around the best energy design for each module count.
    seeds={}
    for r in results:
        count=r['panels_count']
        if count not in seeds or r['annual_kwh']>seeds[count]['annual_kwh']:seeds[count]=r
    for r in list(seeds.values()):
        c=r['config']
        for tilt in [max(0,c['tilt']-5),c['tilt'],min(40,c['tilt']+5)]:
            for az in [max(90,c['azimuth']-15),c['azimuth'],min(270,c['azimuth']+15)]:
                test(tilt,az,c['rows'],c['panel_limit'],c['layout_mode'])
    return {'results': results,'tested':len(seen),'rows_limit':rows_limit,'refined_seeds':len(seeds)}


def recommend(inputs):
    start=time.perf_counter()
    key=json.dumps({k:inputs.model_dump(mode='json')[k] for k in PHYSICAL_KEYS},sort_keys=True)
    before=physical_search.cache_info().hits
    physical=physical_search(key)
    results=[]
    for r in physical['results']:
        result={**r,**finance(inputs,r['capacity_kw'],r['monthly_kwh'])}
        result.pop('cashflow')
        result['decision']=assess(inputs,result)
        results.append(result)
    frontier=pareto(results)
    eligible=[r for r in results if r['decision']['eligible']]
    eligible_frontier=pareto(eligible)
    recommendations={}
    if eligible_frontier:
        lo,hi=eligible_frontier[0],eligible_frontier[-1]
        def distance(r):
            return ((r['initial_cost']-lo['initial_cost'])/max(hi['initial_cost']-lo['initial_cost'],1))**2 + ((hi['annual_kwh']-r['annual_kwh'])/max(hi['annual_kwh']-lo['annual_kwh'],1))**2
        scenario='B' if inputs.post_fit else 'A'
        choices={'economy':lo,'generation':hi,'balanced':min(eligible_frontier,key=distance),
                 'npv':max(eligible,key=lambda r:r[f'npv_{scenario}'])}
        returning=[r for r in eligible if r[f'payback_years_{scenario}'] is not None]
        if returning:choices['payback']=min(returning,key=lambda r:(r[f'payback_years_{scenario}'],-r[f'npv_{scenario}']))
        small=[r for r in eligible if r['capacity_kw']<=10]
        if small:choices['under10']=max(small,key=lambda r:r[f'npv_{scenario}'])
        for name,r in choices.items():
            recommendations[name]={**r,'choice_reason':name,'reason_details':{
                'budget_remaining':round(inputs.budget-r['initial_cost'],2) if inputs.budget else None,
                'stable_payback':r[f"stable_payback_{'B' if inputs.post_fit else 'A'}"],
                'npv':r[f"npv_{'B' if inputs.post_fit else 'A'}"],
                'extra_cost_vs_lower':round(r['initial_cost']-lo['initial_cost'],2),
                'extra_energy_vs_lower':round(r['annual_kwh']-lo['annual_kwh'],1)}}
    rejection_counts={reason:sum(reason in r['decision']['reasons'] for r in results) for reason in ['budget','profit','payback','minimum_capacity']}
    baseline={'config':None,'panels_count':0,'capacity_kw':0,'annual_kwh':0,'initial_cost':0,'net_A':0,'net_B':0,'npv_A':0,'npv_B':0,
              'status':'baseline','reason':'No installation spending or solar generation; ordinary electricity bills are outside both comparisons.'}
    return {'configs':results,'frontier':frontier,'eligible_frontier':eligible_frontier,'recommendations':recommendations,
            'tested':physical['tested'],'eligible_count':len(eligible),'rejection_counts':rejection_counts,
            'no_install':baseline,'verdict':'options_available' if recommendations else 'defer_installation',
            'search_scope':{'tilts':[0,10,20,30,40],'azimuths':[90,120,150,180,210,240,270],
                'rows_limit':physical['rows_limit'],'refinement':'±5° tilt and ±15° azimuth around best module-count candidates',
                'global_optimum':False,'equal_spacing':True,'layout_search':'Spread and coverage-limited compact; 9 pitches plus coverage boundary x 17 offsets; minimum access gap enforced',
                'module_counts':'Full layouts and explicit 22-module / 9.9 kW cap; not exhaustive over every subset'},
            'model_version':MODEL_VERSION,'physical_cache_hit':physical_search.cache_info().hits>before,
            'runtime_seconds':round(time.perf_counter()-start,3)}
