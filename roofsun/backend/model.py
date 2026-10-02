"""Deterministic hourly solar model and transparent geometric/financial assumptions."""
from datetime import date
from functools import lru_cache
from pathlib import Path
import json
import math
import numpy as np
import pandas as pd
import pvlib
from pydantic import BaseModel, Field, model_validator
from shapely import affinity
from shapely.geometry import Polygon, LineString, box

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = json.loads((ROOT/'data/settings.json').read_text())
PANEL, POLICY = SETTINGS['panel'], SETTINGS['policy']


class Inputs(BaseModel):
    width: float = Field(default=8, ge=0.5, le=30)
    depth: float = Field(default=6, ge=0.5, le=30)
    roof_rotation: float = Field(default=0, ge=0, le=359)
    house_area: float = Field(default=80, ge=1, le=1500)
    horizon: list[float] = Field(default_factory=lambda:[0]*12, min_length=12, max_length=12)
    price_per_kw: float = Field(default=14000, gt=0, le=100000)
    fixed_cost: float = Field(default=640, ge=0, le=1000000)
    annual_om: float = Field(default=300, ge=0, le=100000)
    inverter_cost: float = Field(default=5000, ge=0, le=100000)
    commissioning: date = date(2027,1,1)
    post_fit: bool = False
    self_use_rate: float = Field(default=1.4, ge=0, le=5)
    self_use_share: float = Field(default=0.5, ge=0, le=1)

    @model_validator(mode='after')
    def validate_inputs(self):
        if any(not math.isfinite(v) or not 0 <= v <= 80 for v in self.horizon):
            raise ValueError('Each horizon angle must be finite and between 0 and 80 degrees')
        for name in ['width','depth','roof_rotation','house_area','price_per_kw','fixed_cost','annual_om','inverter_cost','self_use_rate','self_use_share']:
            if not math.isfinite(getattr(self,name)):
                raise ValueError('Input values must be finite')
        if self.house_area < self.width*self.depth:
            raise ValueError('House covered area must be at least the available rooftop area')
        if not date(2026,1,1) <= self.commissioning <= date(2033,12,31):
            raise ValueError('Commissioning date must be between 2026 and 2033')
        return self


class Configuration(BaseModel):
    tilt: float = Field(default=20, ge=0, le=40)
    azimuth: float = Field(default=180, ge=90, le=270)
    rows: int = Field(default=3, ge=1, le=12)


class Evaluation(BaseModel):
    inputs: Inputs = Field(default_factory=Inputs)
    config: Configuration = Field(default_factory=Configuration)


@lru_cache(maxsize=1)
def weather():
    df = pd.read_csv(ROOT/'data/weather_2025.csv')
    t = pd.DatetimeIndex(pd.to_datetime(df.timestamp, utc=True)) + pd.Timedelta(minutes=30)
    t = t.tz_convert('Asia/Hong_Kong')
    pos = pvlib.solarposition.get_solarposition(t, SETTINGS['location']['lat'], SETTINGS['location']['lon'])
    ghi = df.ghi_wm2.to_numpy(float)
    dni_dhi = pvlib.irradiance.erbs(ghi,pos.zenith.to_numpy(), t.dayofyear)
    # Only daylight irradiance enters the physical model; hourly data is kept intact.
    day = pos.apparent_elevation.to_numpy() > 0
    return dict(times=t, altitude=pos.apparent_elevation.to_numpy(), azimuth=pos.azimuth.to_numpy(),
                zenith=pos.zenith.to_numpy(), ghi=np.where(day,ghi,0),
                dni=np.where(day,np.nan_to_num(dni_dhi['dni']),0),
                dhi=np.where(day,np.nan_to_num(dni_dhi['dhi']),0), temp=df.temp_c.to_numpy(float))


def rotate_points(points, degrees):
    a=np.radians(degrees)
    return [[float(x*np.cos(a)-y*np.sin(a)),float(x*np.sin(a)+y*np.cos(a))] for x,y in points]


def layout(inputs: Inputs, config: Configuration):
    margin=SETTINGS['model']['edge_margin_m']
    length, width=PANEL['length_m'], PANEL['width_m']
    projected=length*np.cos(np.radians(config.tilt))
    if inputs.width<=2*margin or inputs.depth<=2*margin:
        return [], [], 0, 'no_space'
    roof=box(margin,margin,inputs.width-margin,inputs.depth-margin)
    local=affinity.rotate(roof,config.azimuth-inputs.roof_rotation,origin=(0,0))
    # Erode the convex roof by the module footprint. Extreme rotated-roof
    # corners are not valid row centres: they cannot hold a complete module.
    centres=local
    for dx in [-width/2,width/2]:
        for dy in [-projected/2,projected/2]:
            centres=centres.intersection(affinity.translate(local,xoff=-dx,yoff=-dy))
    if centres.is_empty:
        return [],[],0,'no_space'
    _,ymin,_,ymax=centres.bounds
    available=ymax-ymin+projected
    if config.rows*projected>available+1e-8:
        return [],[],0,'overlap'
    # A single row is centred; multiple rows are equally spread over the available depth.
    ys=([0.5*(ymin+ymax)] if config.rows==1 else
        np.linspace(ymax,ymin,config.rows))
    panels=[]; rows=[]; polygons=[]
    for y in ys:
        edges=[local.intersection(LineString([(-100,y+s*projected/2),(100,y+s*projected/2)])) for s in [-1,1]]
        if any(e.is_empty for e in edges): continue
        left=max(e.bounds[0] for e in edges); right=min(e.bounds[2] for e in edges)
        count=max(0,int((right-left+1e-8)//width))
        if not count: continue
        xstart=(left+right-count*width)/2
        row_index=len(rows)
        rows.append({'y':float(y),'count':count})
        for n in range(count):
            x=xstart+n*width
            corners=[[x,y+projected/2],[x+width,y+projected/2],[x+width,y-projected/2],[x,y-projected/2]]
            native=rotate_points(corners,inputs.roof_rotation-config.azimuth)
            polygons.append(Polygon(native))
            panels.append({'corners':native,'row':row_index})
    if not panels: return [],[],0,'no_space'
    from shapely.ops import unary_union
    coverage=unary_union(polygons).convex_hull.area
    return panels,rows,float(coverage),None


def shading_fractions(altitude, sun_azimuth, tilt, azimuth, rows):
    """Infinite-row geometric model, with the upstream edge switched when needed.

    Uses the ray/plane intersection identity; skips finite row-end effects.
    Row positions and tilt are identical to the scene geometry.
    """
    altitude=np.asarray(altitude,float); sun_azimuth=np.asarray(sun_azimuth,float)
    cos_delta=np.cos(np.radians(sun_azimuth-azimuth))
    alpha=np.radians(altitude)
    profile=np.arctan2(np.maximum(0,np.sin(alpha)),np.abs(np.cos(alpha)*cos_delta))
    signed_tilt=np.where(cos_delta>=0,tilt,-tilt)
    denominator=PANEL['length_m']*np.sin(profile+np.radians(signed_tilt))
    result=np.zeros((len(rows),altitude.size))
    for i in range(len(rows)):
        front_pitch=rows[i-1]['y']-rows[i]['y'] if i>0 else 0
        back_pitch=rows[i]['y']-rows[i+1]['y'] if i<len(rows)-1 else 0
        pitch=np.where(cos_delta>=0,front_pitch,back_pitch)
        f=1-np.divide(pitch*np.sin(profile),denominator,out=np.zeros_like(profile),where=denominator>1e-9)
        result[i]=np.where((altitude>0)&(pitch>0)&(denominator>1e-9),np.clip(f,0,1),0)
    return result


def finance(inputs, capacity, monthly):
    fit=POLICY['fit_small'] if capacity<=10 else POLICY['fit_medium'] if capacity<=200 else POLICY['fit_large']
    cost=inputs.price_per_kw*capacity+inputs.fixed_cost
    start=pd.Timestamp(inputs.commissioning)
    end=start+pd.DateOffset(years=SETTINGS['finance']['life_years'])
    months=pd.date_range(start.replace(day=1),end.replace(day=1),freq='MS')
    cf_a=cf_b=-cost; pay_a=pay_b=None
    flows=[{'date':start.strftime('%Y-%m-%d'),'A':round(cf_a,2),'B':round(cf_b,2)}]
    for m in months:
        begin=max(start,m); stop=min(end,m+pd.offsets.MonthBegin(1))
        if stop<=begin: continue
        fraction=(stop-begin).days/m.days_in_month
        age=max(0,(begin-start).days/365.2425)
        energy=monthly[m.month-1]*(1-PANEL['degradation'])**age*fraction
        spend=inputs.annual_om/12*fraction
        # Replacement occurs once on the tenth commissioning anniversary.
        anniversary=start+pd.DateOffset(years=10)
        if begin<=anniversary<stop: spend+=inputs.inverter_cost
        in_fit=begin<pd.Timestamp('2034-01-01')
        income=energy*fit if in_fit else 0
        cf_a+=income-spend
        cf_b+=(income if in_fit else energy*inputs.self_use_rate*inputs.self_use_share)-spend
        stamp=(stop-pd.Timedelta(days=1)).strftime('%Y-%m-%d')
        if cf_a>=0 and pay_a is None: pay_a=stamp
        if cf_b>=0 and pay_b is None: pay_b=stamp
        flows.append({'date':stamp,'A':round(cf_a,2),'B':round(cf_b,2)})
    return {'initial_cost':round(cost,2),'fit_rate':fit,'payback_A':pay_a,'payback_B':pay_b,
            'net_A':round(cf_a,2),'net_B':round(cf_b,2),'cashflow':flows}


def evaluate(inputs: Inputs, config: Configuration, details=True):
    panels, rows, coverage, error=layout(inputs,config)
    count=len(panels); capacity=count*PANEL['power_w']/1000
    violations=[]
    if error: violations.append(error)
    if coverage>inputs.house_area*POLICY['coverage_limit']+1e-6: violations.append('coverage')
    load=count*(PANEL['mass_kg']+PANEL['rack_mass_kg'])/coverage if coverage else 0
    if load>POLICY['load_limit']: violations.append('load')
    w=weather(); horizon=np.interp(w['azimuth'],np.arange(13)*30,inputs.horizon+[inputs.horizon[0]])
    beam_clear=w['altitude']>horizon
    svf=float(np.mean(np.cos(np.radians(inputs.horizon))**2))
    irrad=pvlib.irradiance.get_total_irradiance(config.tilt,config.azimuth,w['zenith'],w['azimuth'],w['dni'],w['ghi'],w['dhi'],albedo=SETTINGS['model']['albedo'],model='isotropic')
    direct=np.maximum(0,np.nan_to_num(irrad['poa_direct']))
    diffuse=np.maximum(0,np.nan_to_num(irrad['poa_sky_diffuse']))*svf+np.maximum(0,np.nan_to_num(irrad['poa_ground_diffuse']))
    shade=shading_fractions(w['altitude'],w['azimuth'],config.tilt,config.azimuth,rows)
    power=np.zeros(len(w['times'])); baseline=np.zeros_like(power); row_losses=[]
    for i,row in enumerate(rows):
        base=direct+np.nan_to_num(irrad['poa_diffuse'])
        poa=direct*beam_clear*(1-shade[i])+diffuse
        def p(g):
            tc=w['temp']+(PANEL['noct_c']-20)/800*g
            return np.maximum(0,PANEL['power_w']/1000*g/1000*(1+PANEL['temp_coefficient']*(tc-25))*SETTINGS['model']['system_efficiency'])
        production=p(poa)*row['count']; unshaded=p(base)*row['count']
        power+=production;baseline+=unshaded
        row_losses.append(round(100*(1-production.sum()/unshaded.sum()),1) if unshaded.sum()>0 else 0)
    monthly=[round(float(power[w['times'].month==m].sum()),2) for m in range(1,13)]
    annual=float(power.sum()); base=float(baseline.sum())
    economy=finance(inputs,capacity,monthly)
    result={'config':config.model_dump(),'panels_count':count,'capacity_kw':round(capacity,3),
            'annual_kwh':round(annual,1),'specific_yield':round(annual/capacity,1) if capacity else 0,
            'shading_loss_pct':round(100*(1-annual/base),1) if base else 0,
            'coverage_m2':round(coverage,2),'coverage_limit_m2':round(inputs.house_area*POLICY['coverage_limit'],2),
            'load_kg_m2':round(load,2),'compliant':not violations,'violations':violations,
            'monthly_kwh':monthly,**economy}
    if details: result.update(panels=panels,rows=rows,row_losses=row_losses)
    else: result.pop('cashflow')
    return result


@lru_cache(maxsize=12)
def search_cached(serialized):
    inputs=Inputs.model_validate_json(serialized)
    results=[]
    for tilt in [0,10,20,30,40]:
        for azimuth in [90,120,150,180,210,240,270]:
            for rows in range(1,7):
                config=Configuration(tilt=tilt,azimuth=azimuth,rows=rows)
                result=evaluate(inputs,config,False)
                if result['panels_count']>0 and result['compliant']:results.append(result)
    frontier=[]
    # Non-dominated configurations: no other costs <= and produces >= with a strict improvement.
    best=-1
    ordered=sorted(results,key=lambda r:(r['initial_cost'],-r['annual_kwh']))
    for r in ordered:
        if r['annual_kwh']>best+1e-6:
            frontier.append(r);best=r['annual_kwh']
    recommendations={}
    if frontier:
        recommendations['economy']=frontier[0]
        recommendations['generation']=frontier[-1]
        lo,hi=frontier[0],frontier[-1]
        # Closest to ideal normalized cost/energy point; disclose criterion in UI/docs.
        def distance(r):
            cost=(r['initial_cost']-lo['initial_cost'])/max(hi['initial_cost']-lo['initial_cost'],1)
            energy=(hi['annual_kwh']-r['annual_kwh'])/max(hi['annual_kwh']-lo['annual_kwh'],1)
            return cost*cost+energy*energy
        recommendations['balanced']=min(frontier,key=distance)
    return {'configs':results,'frontier':frontier,'recommendations':recommendations,'tested':210}


def search(inputs):return search_cached(inputs.model_dump_json())


def sun_preview(inputs,config,day,hour):
    t=pd.DatetimeIndex([pd.Timestamp(f'{day} 00:00',tz='Asia/Hong_Kong')+pd.Timedelta(hours=hour)])
    pos=pvlib.solarposition.get_solarposition(t,SETTINGS['location']['lat'],SETTINGS['location']['lon'])
    alt=float(pos.apparent_elevation.iloc[0]);az=float(pos.azimuth.iloc[0])
    h=float(np.interp(az,np.arange(13)*30,inputs.horizon+[inputs.horizon[0]]))
    _,rows,_,_=layout(inputs,config)
    fractions=shading_fractions([alt],[az],config.tilt,config.azimuth,rows)[:,0].tolist()
    return {'altitude':round(alt,2),'azimuth':round(az,2),'horizon':h,'beam_clear':alt>h,
            'row_shade':fractions,'timestamp':t[0].isoformat()}
