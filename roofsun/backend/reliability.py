"""Reproducible scenario analysis. Ranges are not statistical confidence bounds."""
from functools import lru_cache
import json
import numpy as np
import pandas as pd
import pvlib
from .model import Inputs, Configuration, evaluate, weather, MODEL_VERSION, REGIONS
from .decision import recommend


def summary(result, inputs):
    scenario='B' if inputs.post_fit else 'A'
    return {k:result[k] for k in ['config','panels_count','capacity_kw','annual_kwh','specific_yield','shading_loss_pct','initial_cost','fit_rate','compliant']} | {
        'max_acceptable_quote':result[f'max_acceptable_quote_{scenario}'],
        'max_acceptable_per_kw':result[f'max_acceptable_per_kw_{scenario}'],
        'net':result[f'net_{scenario}'],'npv':result[f'npv_{scenario}'],
        'stable_payback':result[f'stable_payback_{scenario}'],'decision':result['decision']}


def reference_case(inputs, config):
    # Single row avoids row shading; obstructing geometry is removed for both tools.
    clean=inputs.model_copy(update={'horizon':[0]*12,'exclusions':[],'neighbours':[], 'weather_scale':1})
    configuration=Configuration(tilt=config.tilt,azimuth=config.azimuth,rows=1)
    ours=evaluate(clean,configuration)
    if not ours['capacity_kw']:
        return {'available':False,'capacity_kw':0,'configuration':configuration.model_dump(),
                'reason':'No complete module fits the unobstructed reference case.',
                'reference_kwh':0,'roofsun_kwh':0,'monthly':[],'difference_pct':None}
    w=weather(inputs.weather_year,inputs.region)
    frame=pd.DataFrame({'ghi':w['ghi'],'dni':w['dni'],'dhi':w['dhi'],'temp_air':w['temp'],'wind_speed':1.},index=w['times'])
    system=pvlib.pvsystem.PVSystem(surface_tilt=config.tilt,surface_azimuth=config.azimuth,
        albedo=0.2,module_parameters={'pdc0':ours['capacity_kw']*1000,'gamma_pdc':-0.0035},
        inverter_parameters={'pdc0':ours['capacity_kw']*1000/0.96},
        temperature_model_parameters=pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS['sapm']['open_rack_glass_glass'])
    loc=REGIONS[inputs.region]
    location=pvlib.location.Location(loc['lat'],loc['lon'],tz=loc['timezone'])
    chain=pvlib.modelchain.ModelChain.with_pvwatts(system,location,transposition_model='isotropic',aoi_model='no_loss',spectral_model='no_loss')
    chain.run_model(frame)
    reference=np.nan_to_num(np.asarray(chain.results.ac))/1000
    monthly=[round(float(reference[w['times'].month==m].sum()),2) for m in range(1,13)]
    annual=float(reference.sum())
    difference=100*(ours['annual_kwh']-annual)/annual if annual else None
    return {'available':True,'configuration':configuration.model_dump(),'capacity_kw':ours['capacity_kw'],
        'roofsun_kwh':ours['annual_kwh'],'reference_kwh':round(annual,1),'difference_pct':round(difference,2) if difference is not None else None,
        'monthly':[{'month':m,'roofsun_kwh':ours['monthly_kwh'][m-1],'reference_kwh':monthly[m-1]} for m in range(1,13)],
        'reference_tool':'pvlib ModelChain / PVWatts DC + inverter / SAPM temperature',
        'reference_version':pvlib.__version__,'reference_wind_ms':1,
        'scope':'Cross-model comparison, not measured accuracy. Shared weather, location and irradiance components. Reference uses SAPM temperature with assumed 1 m/s wind, default PVWatts losses and explicit inverter efficiency; RoofSun uses NOCT temperature and 0.85 system factor.',
        'source_url':'https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.modelchain.ModelChain.with_pvwatts.html'}


@lru_cache(maxsize=12)
def analyse_cached(serialized):
    payload=json.loads(serialized)
    inputs=Inputs.model_validate(payload['inputs']);config=Configuration.model_validate(payload['config'])
    base=evaluate(inputs,config)
    scenarios=[]
    changes=[('base',{}),('weather_minus_15',{'weather_scale':max(.5,inputs.weather_scale*.85)}),('weather_minus_10',{'weather_scale':max(.5,inputs.weather_scale*.9)}),
             ('weather_plus_10',{'weather_scale':min(1.5,inputs.weather_scale*1.1)}),
             ('quote_minus_20',{'price_per_kw':inputs.price_per_kw*.8,'fixed_cost':inputs.fixed_cost*.8}),
             ('quote_plus_20',{'price_per_kw':min(100000,inputs.price_per_kw*1.2),'fixed_cost':min(1000000,inputs.fixed_cost*1.2)}),
             ('horizon_plus_5',{'horizon':[min(80,x+5) for x in inputs.horizon]}),
             ('horizon_minus_5',{'horizon':[max(0,x-5) for x in inputs.horizon]}),
             ('delay_6_months',{'commissioning':min(pd.Timestamp(inputs.commissioning)+pd.DateOffset(months=6),pd.Timestamp('2033-12-31')).date()}),
             ('electrical_alternative',{'electrical_model':'martinez' if inputs.electrical_model=='linear' else 'linear'}),
             ('row_geometry_alternative',{'finite_rows':not inputs.finite_rows}),
             ('quote_30000',{'price_per_kw':30000})]
    for name,updates in changes:
        inp=inputs.model_copy(update=updates)
        result=evaluate(inp,config)
        scenarios.append({'id':name,**summary(result,inp)})
    years=[]
    ranking=[]
    for year in [2023,2024,2025]:
        inp=inputs.model_copy(update={'weather_year':year})
        result=evaluate(inp,config)
        years.append({'year':year,'hours':len(weather(year,inputs.region)['times']),**summary(result,inp)})
        searched=recommend(inp)
        selected=searched['recommendations'].get('npv')
        ranking.append({'year':year,'config':selected['config'] if selected else None,
                        'annual_kwh':selected['annual_kwh'] if selected else None,'verdict':searched['verdict']})
    # Robustness of the recommendation to quote/horizon uncertainty, not only yield.
    for name,updates in [(n,u) for n,u in changes if n in ['weather_minus_15','quote_plus_20','horizon_plus_5','delay_6_months','quote_30000']]:
        searched=recommend(inputs.model_copy(update=updates))
        selected=searched['recommendations'].get('npv')
        ranking.append({'scenario':name,'config':selected['config'] if selected else None,
                        'annual_kwh':selected['annual_kwh'] if selected else None,'verdict':searched['verdict']})
    designs={json.dumps(r['config'],sort_keys=True) for r in ranking}
    row_comparison=[]
    for rows in range(max(1,config.rows-1),min(24,config.rows+1)+1):
        r=evaluate(inputs,config.model_copy(update={'rows':rows}))
        row_comparison.append(summary(r,inputs))
    from .reference import irradiance_check
    return {'irradiance_check':irradiance_check(inputs.weather_year,inputs.weather_scale) if inputs.region=='hong_kong' else None,'model_version':MODEL_VERSION,'base':summary(base,inputs),'scenarios':scenarios,'weather_years':years,
        'range':{'annual_kwh':[min(r['annual_kwh'] for r in scenarios+years),max(r['annual_kwh'] for r in scenarios+years)],
                 'npv':[min(r['npv'] for r in scenarios+years),max(r['npv'] for r in scenarios+years)]},
        'ranking':ranking,'ranking_stable':len(designs)==1,'distinct_recommendations':len(designs),
        'row_comparison':row_comparison,'reference':reference_case(inputs,config),
        'scope':'One-at-a-time scenario envelope plus three historical weather years; not a confidence interval, probability or P90 estimate. Unmeasured rooftop effects remain.'}


def analyse(inputs,config):
    return analyse_cached(json.dumps({'inputs':inputs.model_dump(mode='json'),'config':config.model_dump()},sort_keys=True))
