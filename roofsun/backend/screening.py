"""Seven owner inputs mapped onto the existing physical and finance model.

No irradiance, packing, shade or cash-flow equations are implemented here.
This layer normalises inputs, chooses configurations and organises evidence.
"""
from datetime import date
from functools import lru_cache
from typing import Literal
import json
import math
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field
from .calibration import calibration, weather_ratio
from .model import Inputs, Configuration, evaluate, search, sun_preview, MODEL_VERSION, POLICY

COST_BANDS={
    'low':{'fixed_cost':2000,'annual_om':0,'inverter_cost':4000},
    'medium':{'fixed_cost':5000,'annual_om':300,'inverter_cost':5000},
    'high':{'fixed_cost':10000,'annual_om':1000,'inverter_cost':10000},
}
QUOTE_REFERENCES={'low':20000,'medium':25000,'high':30000}

class OwnerModel(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)

class RoofDimensions(OwnerModel):
    width:float=Field(default=8.06,ge=1,le=30)
    depth:float=Field(default=8.06,ge=1,le=30)

class SouthNeighbour(OwnerModel):
    floors:float=Field(default=0,ge=0,le=15)
    distance:float=Field(default=10,ge=.5,le=200)

class SevenInputs(OwnerModel):
    roof:RoofDimensions=Field(default_factory=RoofDimensions)
    door_direction:Literal[0,45,90,135,180,225,270,315]=0
    neighbour:SouthNeighbour=Field(default_factory=SouthNeighbour)
    price_per_kw:float=Field(default=25000,gt=0,le=100000)
    cost_band:Literal['low','medium','high']='medium'
    commissioning_month:str=Field(default='2027-01',pattern=r'^(202[6-9]|203[0-3])-(0[1-9]|1[0-2])$')
    post_fit:bool=False

class ScreeningRequest(OwnerModel):
    inputs:SevenInputs=Field(default_factory=SevenInputs)
    selected_rows:int|None=Field(default=None,ge=1,le=24)


def south_horizon(floors,distance):
    # Same 12-sector facade projection as the former Screening.jsx converter.
    result=[]
    for i in range(12):
        delta=abs((i*30-180+540)%360-180)
        angle=min(80,math.degrees(math.atan2(floors*3*math.cos(math.radians(delta)),distance))) if delta<=60 else 0
        result.append(round(angle,1))
    return result


def model_inputs(owner:SevenInputs):
    return Inputs(width=owner.roof.width,depth=owner.roof.depth,
        house_area=owner.roof.width*owner.roof.depth,exclusions=[],village_house_mode=True,
        roof_rotation=owner.door_direction,horizon=south_horizon(owner.neighbour.floors,owner.neighbour.distance),
        price_per_kw=owner.price_per_kw,**COST_BANDS[owner.cost_band],
        commissioning=date.fromisoformat(owner.commissioning_month+'-01'),post_fit=owner.post_fit,
        self_use_rate=1.4,self_use_share=.5,discount_rate=.04,cost_inflation=0,
        weather_year=2025,weather_scale=weather_ratio(2025),finite_rows=True,
        electrical_model='martinez',bypass_blocks=3,minimum_capacity_kw=2,
        minimum_row_fill_ratio=.7,minimum_access_gap_m=.3,extra_mass_per_module=0,load_limit=150,
        budget=0,max_payback_years=0,require_profit=False)


def classify(points):
    values=[p['npv'] for p in points]
    if min(values)>0:return 'worthwhile'
    if max(values)>0:return 'marginal'
    return 'not_recommended'


def npv_interval(inputs,config):
    scenario='B' if inputs.post_fit else 'A'
    points=[]
    for name,scale,rate in [('conservative',calibration()['combined_ratio'],.08),
                             ('current',inputs.weather_scale,.04),('optimistic',1.,0.)]:
        inp=inputs.model_copy(update={'weather_scale':scale,'discount_rate':rate})
        result=evaluate(inp,config,False)
        points.append({'id':name,'weather_scale':scale,'discount_rate':rate,'npv':result[f'npv_{scenario}'],
                       'annual_kwh':result['annual_kwh']})
    return {'points':points,'min':min(p['npv'] for p in points),'max':max(p['npv'] for p in points),
            'verdict':classify(points),'scope':'Three deterministic scenarios for the same configuration, not a confidence interval or probability.'}


def select_result(inputs,selected_rows=None):
    results=search(inputs)
    options=[r for r in results['configs'] if r['capacity_kw']>=inputs.minimum_capacity_kw]
    scenario='B' if inputs.post_fit else 'A'
    recommended=max(options,key=lambda r:r[f'npv_{scenario}'],default=None)
    available=sorted({r['actual_rows'] for r in options})
    selected=[r for r in options if selected_rows is None or r['actual_rows']==selected_rows]
    chosen=max(selected,key=lambda r:r[f'npv_{scenario}'],default=None)
    if chosen is None and recommended is not None:chosen=recommended
    return recommended,chosen,available,results['tested']


def view_result(inputs,config):
    r=evaluate(inputs,config)
    s='B' if inputs.post_fit else 'A'
    r.update(npv=r[f'npv_{s}'],payback_years=r[f'payback_years_{s}'],payback_date=r[f'stable_payback_{s}'],
             quote_ceiling_per_kw=r[f'max_acceptable_per_kw_{s}'])
    # A large cash-flow array is not needed by the owner screen.
    r.pop('cashflow',None)
    return r


def delay_cost(inputs,config,months=6):
    delayed=inputs.model_copy(update={'commissioning':(pd.Timestamp(inputs.commissioning)+pd.DateOffset(months=months)).date()})
    s='B' if inputs.post_fit else 'A'
    base=evaluate(inputs,config,False);after=evaluate(delayed,config,False)
    return {'months':months,'npv_lost':round(base[f'npv_{s}']-after[f'npv_{s}'],2),
            'delayed_commissioning':delayed.commissioning.isoformat(),
            'scope':'Same configuration and costs; change in discounted net value, not guaranteed cash earnings.'}


@lru_cache(maxsize=24)
def screen_cached(serialized):
    request=ScreeningRequest.model_validate_json(serialized)
    inputs=model_inputs(request.inputs)
    recommended,chosen,available,tested=select_result(inputs,request.selected_rows)
    base={'model_version':MODEL_VERSION,'inputs':request.inputs.model_dump(),
          'mapped_inputs':inputs.model_dump(mode='json'),'available_rows':available,'tested':tested,
          'recommendation_rule':'Highest current-scenario NPV among searched physically feasible designs of at least 2 kW; financial outcomes may be negative.',
          'warnings':['village_house_area'] if inputs.house_area>POLICY['village_house_area_limit_m2'] else []}
    if chosen is None:
        return {**base,'result':None,'recommended':None,'interval':None,'verdict':'not_recommended',
                'reason':'no_feasible_system','tradeoff':None,'sun_path':[],'delay':None}
    config=Configuration(**chosen['config']);result=view_result(inputs,config)
    interval=npv_interval(inputs,config)
    # Row alternatives are re-optimised for that row count to remain buildable.
    alternatives={}
    for direction,target in [('less',result['actual_rows']-1),('more',result['actual_rows']+1)]:
        if target in available:
            _,alt,_,_=select_result(inputs,target)
            alternatives[direction]=view_result(inputs,Configuration(**alt['config']))
    recommended_result=view_result(inputs,Configuration(**recommended['config']))
    neighbour=alternatives.get('more') or alternatives.get('less')
    pair=sorted([result,neighbour],key=lambda r:r['actual_rows']) if neighbour else []
    tradeoff=None
    if pair:
        a,b=pair
        tradeoff={'from':a,'to':b,'extra_kwh':round(b['annual_kwh']-a['annual_kwh'],1),
                 'extra_cost':round(b['initial_cost']-a['initial_cost'],2),
                 'payback_months':(date.fromisoformat(b['payback_date']).year-date.fromisoformat(a['payback_date']).year)*12+date.fromisoformat(b['payback_date']).month-date.fromisoformat(a['payback_date']).month if a['payback_date'] and b['payback_date'] else None,
                 'angles_changed':a['config']['tilt']!=b['config']['tilt'] or a['config']['azimuth']!=b['config']['azimuth']}
    sun_path=[{'hour':h/2,**sun_preview(inputs,config,date(2025,12,21),h/2)} for h in range(12,37)]
    return {**base,'result':result,'recommended':recommended_result,'interval':interval,'verdict':interval['verdict'],
            'reason':'scenario_range','alternatives':{k:v['actual_rows'] for k,v in alternatives.items()},
            'tradeoff':tradeoff,'sun_path':sun_path,'delay':delay_cost(inputs,config),
            'recommended_interval':interval if config==Configuration(**recommended['config']) else npv_interval(inputs,Configuration(**recommended['config'])),
            'is_recommended':config==Configuration(**recommended['config'])}


def screen(request):return screen_cached(request.model_dump_json())


@lru_cache(maxsize=12)
def analyse_seven_cached(serialized):
    request=ScreeningRequest.model_validate_json(serialized)
    owner=request.inputs;inputs=model_inputs(owner)
    recommended,_,_,_=select_result(inputs)
    if recommended is None:return {'available':False,'scenarios':[],'reason':'no_feasible_system','model_version':MODEL_VERSION}
    config=Configuration(**recommended['config'])
    cases=[('quote_minus_20',{'price_per_kw':inputs.price_per_kw*.8}),
           ('quote_plus_20',{'price_per_kw':inputs.price_per_kw*1.2}),
           ('delay_6_months',{'commissioning':(pd.Timestamp(inputs.commissioning)+pd.DateOffset(months=6)).date()}),
           ('delay_12_months',{'commissioning':(pd.Timestamp(inputs.commissioning)+pd.DateOffset(months=12)).date()}),
           ('neighbour_plus_floor',{'horizon':south_horizon(owner.neighbour.floors+1,owner.neighbour.distance)}),
           ('high_other_costs',COST_BANDS['high']),('linear_electrical',{'electrical_model':'linear'}),
           ('weather_2023',{'weather_year':2023,'weather_scale':weather_ratio(2023)}),
           ('weather_2024',{'weather_year':2024,'weather_scale':weather_ratio(2024)})]
    scenarios=[]
    for name,changes in cases:
        inp=inputs.model_copy(update=changes)
        fixed=view_result(inp,config);interval=npv_interval(inp,config)
        other,_,_,_=select_result(inp)
        other_config=Configuration(**other['config']) if other else None
        scenarios.append({'id':name,'npv':fixed['npv'],'annual_kwh':fixed['annual_kwh'],
                          'payback_years':fixed['payback_years'],'verdict':interval['verdict'],
                          'recommendation_changed':other_config!=config,
                          'alternative_config':other_config.model_dump() if other_config else None,
                          'scope':'NPV and conclusion use the current recommended configuration; change flag independently re-runs the configuration search.'})
    return {'available':True,'model_version':MODEL_VERSION,'configuration':config.model_dump(),
            'interval':npv_interval(inputs,config),'scenarios':scenarios,'calibration':calibration(),
            'field_case':{'available':False,'status':'pending'},
            'scope':'One input changes at a time. Scenarios and recommendation changes are simulations, not probabilities or measured accuracy.'}


def analyse_seven(request):return analyse_seven_cached(request.model_dump_json())


def import_owner(payload):
    """Only the seven owner answers survive import; all fixed assumptions reset."""
    original=payload.get('inputs')
    if isinstance(original,dict) and isinstance(original.get('roof'),dict):
        allowed={key:original[key] for key in SevenInputs.model_fields if key in original}
        return SevenInputs.model_validate(allowed),False
    if original is None and payload.get('plans'):
        plans=payload['plans']
        if not isinstance(plans,list) or not isinstance(plans[0],dict):raise ValueError('Invalid legacy plan list')
        original=plans[0].get('inputs')
    if not isinstance(original,dict):raise ValueError('No owner inputs found in this file')
    # Deleted horizon/obstacle/editor parameters are ignored. Legacy files do
    # not contain the new household neighbour answers, so ask the owner to
    # review the explicitly reset south-neighbour assumption.
    old_cost=[original.get(k,COST_BANDS['medium'][k]) for k in ('fixed_cost','annual_om','inverter_cost')]
    band=next((name for name,c in COST_BANDS.items() if list(c.values())==old_cost),'medium')
    rotation=float(original.get('roof_rotation',0))%360
    direction=int(math.floor((rotation+22.5)/45)*45)%360
    return SevenInputs.model_validate({'roof':{'width':original.get('width',8.06),'depth':original.get('depth',8.06)},
         'door_direction':direction,'neighbour':{'floors':0,'distance':10},
         'price_per_kw':original.get('price_per_kw',25000),'cost_band':band,
         'commissioning_month':str(original.get('commissioning','2027-01-01'))[:7],
         'post_fit':original.get('post_fit',False)}),True
