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
from .calibration import weather_ratio
from shapely import affinity
from shapely.geometry import Polygon, LineString, box

ROOT = Path(__file__).resolve().parents[1]
SETTINGS = json.loads((ROOT/'data/settings.json').read_text())
MODEL_VERSION = "3.0.0"
PANEL, POLICY = SETTINGS['panel'], SETTINGS['policy']


class Exclusion(BaseModel):
    x: float = Field(ge=0, le=30)
    y: float = Field(ge=0, le=30)
    width: float = Field(gt=0, le=30)
    depth: float = Field(gt=0, le=30)
    height: float = Field(default=1, ge=0, le=6)


class Inputs(BaseModel):
    width: float = Field(default=8.06, ge=0.5, le=30)
    depth: float = Field(default=8.06, ge=0.5, le=30)
    village_house_mode: bool = True
    roof_rotation: float = Field(default=0, ge=0, le=359)
    house_area: float = Field(default=65, ge=1, le=1500)
    horizon: list[float] = Field(default_factory=lambda:[0]*12, min_length=12, max_length=12)
    price_per_kw: float = Field(default=25000, gt=0, le=100000)
    fixed_cost: float = Field(default=5000, ge=0, le=1000000)
    annual_om: float = Field(default=300, ge=0, le=100000)
    inverter_cost: float = Field(default=5000, ge=0, le=100000)
    commissioning: date = date(2027,1,1)
    post_fit: bool = False
    self_use_rate: float = Field(default=1.4, ge=0, le=5)
    self_use_share: float = Field(default=0.5, ge=0, le=1)

    minimum_access_gap_m: float = Field(default=0.3, ge=0, le=3)
    minimum_row_fill_ratio: float = Field(default=0.7, ge=0, le=1)
    minimum_capacity_kw: float = Field(default=2, ge=0, le=20)
    budget: float = Field(default=0, ge=0, le=10000000)
    max_payback_years: float = Field(default=0, ge=0, le=25)
    require_profit: bool = False
    discount_rate: float = Field(default=0.04, ge=0, le=0.3)
    cost_inflation: float = Field(default=0, ge=0, le=0.15)
    weather_year: int = Field(default=2025, ge=2023, le=2025)
    weather_scale: float = Field(default_factory=weather_ratio, ge=0.5, le=1.5)
    extra_mass_per_module: float = Field(default=0, ge=0, le=500)
    load_limit: float = Field(default=150, gt=0, le=150)
    finite_rows: bool = True
    electrical_model: str = Field(default='martinez', pattern='^(linear|martinez)$')
    bypass_blocks: int = Field(default=3, ge=1, le=6)
    exclusions: list[Exclusion] = Field(default_factory=list, max_length=6)
    quote_source: str = Field(default='Illustrative assumption; replace with an installer quote', max_length=300)
    quote_date: str = Field(default='', max_length=10)
    panel_source: str = Field(default='Generic 450 W engineering reference, not a verified commercial model', max_length=300)

    @model_validator(mode='after')
    def validate_inputs(self):
        if any(not math.isfinite(v) or not 0 <= v <= 80 for v in self.horizon):
            raise ValueError('Each horizon angle must be finite and between 0 and 80 degrees')
        for name in ['width','depth','roof_rotation','house_area','price_per_kw','fixed_cost','annual_om','inverter_cost','self_use_rate','self_use_share','budget','max_payback_years','discount_rate','cost_inflation','weather_scale','extra_mass_per_module','load_limit','minimum_capacity_kw','minimum_row_fill_ratio','minimum_access_gap_m']:
            if not math.isfinite(getattr(self,name)):
                raise ValueError('Input values must be finite')
        if self.house_area + 1e-8 < self.width*self.depth:
            raise ValueError('House covered area must be at least the available rooftop area')
        if not date(2026,1,1) <= self.commissioning <= date(2033,12,31):
            raise ValueError('Commissioning date must be between 2026 and 2033')
        if self.quote_date:
            date.fromisoformat(self.quote_date)
        for rect in self.exclusions:
            if not all(math.isfinite(v) for v in [rect.x, rect.y, rect.width, rect.depth, rect.height]):
                raise ValueError('Obstacle dimensions must be finite')
            if rect.x + rect.width > self.width or rect.y + rect.depth > self.depth:
                raise ValueError('Rooftop obstacles must fit inside the roof')
        return self


class Configuration(BaseModel):
    tilt: float = Field(default=40, ge=0, le=40)
    azimuth: float = Field(default=180, ge=90, le=270)
    rows: int = Field(default=3, ge=1, le=24)
    layout_mode: str = Field(default='compact', pattern='^(spread|compact)$')
    panel_limit: int = Field(default=0, ge=0, le=2000)


class Evaluation(BaseModel):
    inputs: Inputs = Field(default_factory=Inputs)
    config: Configuration = Field(default_factory=Configuration)


@lru_cache(maxsize=3)
def weather(year=2025):
    df = pd.read_csv(ROOT/f'data/weather_{year}.csv')
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
    # Layout caching depends only on geometry, never on irradiance or price.
    geometry={'width':inputs.width,'depth':inputs.depth,'roof_rotation':inputs.roof_rotation,
              'exclusions':[o.model_dump() for o in inputs.exclusions],
              'house_area':inputs.house_area,'minimum_access_gap_m':inputs.minimum_access_gap_m}
    return _layout(json.dumps(geometry,sort_keys=True),config.model_dump_json())


@lru_cache(maxsize=2048)
def _layout(geometry, configuration):
    inputs=Inputs(**json.loads(geometry))
    config=Configuration.model_validate_json(configuration)
    margin=SETTINGS['model']['edge_margin_m'];epsilon=1e-8
    length,width=PANEL['length_m'],PANEL['width_m']
    projected=length*math.cos(math.radians(config.tilt))
    if inputs.width<=2*margin or inputs.depth<=2*margin:
        return [],[],0,'no_space'
    roof=box(margin,margin,inputs.width-margin,inputs.depth-margin)
    angle=config.azimuth-inputs.roof_rotation
    local=affinity.rotate(roof,angle,origin=(0,0))
    centres=local
    for dx in [-width/2,width/2]:
        for dy in [-projected/2,projected/2]:
            centres=centres.intersection(affinity.translate(local,xoff=-dx,yoff=-dy))
    if centres.is_empty:
        return [],[],0,'no_space'
    _,ymin,_,ymax=centres.bounds
    minimum_pitch=projected+inputs.minimum_access_gap_m
    if (config.rows-1)*minimum_pitch>ymax-ymin+epsilon:
        return [],[],0,'overlap'
    vertices=list(local.exterior.coords)
    def span(y):
        # Analytic convex-polygon slice: include boundary intersections with
        # a metric tolerance, so 0.4999999999999999 does not delete a row.
        xs=[]
        for (x1,y1),(x2,y2) in zip(vertices,vertices[1:]):
            if min(y1,y2)-epsilon<=y<=max(y1,y2)+epsilon:
                if abs(y2-y1)<epsilon:xs.extend([x1,x2])
                else:xs.append(x1+(min(1,max(0,(y-y1)/(y2-y1))))*(x2-x1))
        return (min(xs),max(xs)) if xs else None
    # Pre-project obstacle rectangles once. Separating-axis checks avoid building
    # thousands of Shapely polygons during interactive pitch/offset search.
    objects=[]
    for o in inputs.exclusions:
        corners=rotate_points([[o.x,o.y],[o.x+o.width,o.y],[o.x+o.width,o.y+o.depth],[o.x,o.y+o.depth]],angle)
        axes=[(1.,0.),(0.,1.),(math.cos(math.radians(angle)),math.sin(math.radians(angle))),(-math.sin(math.radians(angle)),math.cos(math.radians(angle)))]
        projections=[(ax,ay,min(ax*x+ay*y for x,y in corners),max(ax*x+ay*y for x,y in corners)) for ax,ay in axes]
        objects.append(projections)
    def obstructed(x,y):
        cx=x+width/2
        for projections in objects:
            if all(min(hi,ax*cx+ay*y+abs(ax)*width/2+abs(ay)*projected/2)-max(lo,ax*cx+ay*y-abs(ax)*width/2-abs(ay)*projected/2)>epsilon for ax,ay,lo,hi in projections):return True
        return False
    theta=math.radians(-angle);co,si=math.cos(theta),math.sin(theta)
    def native(corners):return [[x*co-y*si,x*si+y*co] for x,y in corners]
    def candidate(ys):
        placements=[]
        for y in ys:
            edges=[span(y+s*projected/2) for s in [-1,1]]
            if any(e is None for e in edges):continue
            left=max(e[0] for e in edges);right=min(e[1] for e in edges)
            count=max(0,math.floor((right-left+epsilon)/width))
            start=(left+right-count*width)/2
            xs=[start+n*width for n in range(count)]
            if objects:
                xs=[x for x in xs if not obstructed(x,y)]
            placements.append((float(y),xs))
        return placements
    def limited(placement):
        if not config.panel_limit:return placement
        selected=[[] for _ in placement];remaining=config.panel_limit
        ordered=[sorted(xs,key=lambda x:abs(x+width/2-(min(xs)+max(xs)+width)/2)) if xs else [] for _,xs in placement]
        while remaining and any(ordered):
            for i,xs in enumerate(ordered):
                if xs and remaining:selected[i].append(xs.pop(0));remaining-=1
        return [(y,sorted(selected[i])) for i,(y,_) in enumerate(placement)]
    def hull_area(placement):
        # Convex hull of the outer row corners: rotation preserves its area.
        points=sorted(set((x,y+sign*projected/2) for y,xs in placement if xs for x in [min(xs),max(xs)+width] for sign in [-1,1]))
        if len(points)<3:return 0
        def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        def half(seq):
            result=[]
            for point in seq:
                while len(result)>1 and cross(result[-2],result[-1],point)<=0:result.pop()
                result.append(point)
            return result[:-1]
        hull=half(points)+half(points[::-1])
        return abs(sum(x1*y2-x2*y1 for (x1,y1),(x2,y2) in zip(hull,hull[1:]+hull[:1])))/2
    best=[];score=(-1,-1,-float('inf'));fallback=[];fallback_score=(-1,-float('inf'),-1,-float('inf'))
    # A compact layout is a coverage-limited alternative. Pitch remains an
    # explicit tested variable and must leave the editable minimum access gap.
    pitches=[0] if config.rows==1 else np.linspace(minimum_pitch,(ymax-ymin)/(config.rows-1),9)
    if config.rows>1 and config.layout_mode=='compact':
        # Include an exact coverage-boundary pitch for a rectangular row band;
        # the final hull check uses actual rows and excludes invalid estimates.
        central=candidate([(ymin+ymax)/2])
        band_width=max((len(xs)*width for _,xs in central),default=width)
        bound=(inputs.house_area*POLICY['coverage_limit']/band_width-projected)/(config.rows-1)
        if minimum_pitch<=bound<=(ymax-ymin)/(config.rows-1):pitches=sorted(set([*pitches,bound]))
    axis_aligned=abs(math.sin(math.radians(angle*2)))<1e-9
    for pitch in pitches:
        slack=max(0,ymax-ymin-pitch*(config.rows-1))
        offsets=[slack/2] if axis_aligned else np.linspace(0,slack,17)
        for offset in offsets:
            top=ymax-float(offset)
            placement=limited(candidate([top-i*float(pitch) for i in range(config.rows)]))
            count=sum(len(xs) for _,xs in placement)
            rank=(count,float(pitch),-abs(float(offset)-slack/2))
            area=hull_area(placement) if config.layout_mode=='compact' else 0
            fallback_rank=(count,-area if config.layout_mode=='compact' else float(pitch),float(pitch),-abs(float(offset)-slack/2))
            if fallback_rank>fallback_score:fallback=placement;fallback_score=fallback_rank
            if config.layout_mode=='compact' and area>inputs.house_area*POLICY['coverage_limit']+epsilon:continue
            if rank>score:best=placement;score=rank
    # Return an explicit coverage violation if no compact pitch can fit;
    # never silently shrink the requested row count or legal covered area.
    if not best:best=fallback
    panels=[];rows=[];polygons=[]
    for y,xs in best:
        if not xs:continue
        index=len(rows)
        for x in xs:
            corners=native([[x,y+projected/2],[x+width,y+projected/2],[x+width,y-projected/2],[x,y-projected/2]])
            polygons.append(Polygon(corners));panels.append({'corners':corners,'row':index,'local_x':x})
        rows.append({'y':y,'count':len(xs),'intervals':[[x,x+width] for x in xs]})
    if not panels:return [],[],0,'no_space'
    from shapely.ops import unary_union
    return panels,rows,float(unary_union(polygons).convex_hull.area),None


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
    from .finance import cashflows
    return cashflows(inputs, capacity, monthly, SETTINGS)


def finite_shading(altitude, sun_azimuth, config, rows):
    """Adjacent parallel-row shading with lateral overlap of finite row segments.

    Intersection of parallel planes gives a constant lateral ray displacement.
    The 1-D shaded strip is multiplied by its overlap with actual row segments.
    More distant rows and diffuse self-shading are omitted and disclosed.
    """
    fractions = shading_fractions(altitude, sun_azimuth, config.tilt, config.azimuth, rows)
    alpha = np.radians(altitude); delta = np.radians(np.asarray(sun_azimuth)-config.azimuth)
    denominator = np.sin(alpha) + np.cos(alpha)*np.cos(delta)*np.tan(np.radians(config.tilt))
    for i, row in enumerate(rows):
        for front, j in [(True,i-1),(False,i+1)]:
            if not 0<=j<len(rows): continue
            distance = np.divide((rows[j]['y']-row['y'])*np.tan(np.radians(config.tilt)), denominator,
                                 out=np.zeros_like(alpha), where=np.abs(denominator)>1e-9)
            shift = distance*np.cos(alpha)*np.sin(delta)
            overlap = np.zeros_like(alpha)
            for left,right in row['intervals']:
                for other_left,other_right in rows[j]['intervals']:
                    overlap += np.maximum(0,np.minimum(right,other_right-shift)-np.maximum(left,other_left-shift))
            length = sum(right-left for left,right in row['intervals'])
            mask = (np.cos(delta)>=0) if front else (np.cos(delta)<0)
            fractions[i] *= np.where(mask,np.clip(overlap/max(length,1e-9),0,1),1)
    return fractions


def obstacle_clearance(inputs, config, panels, w):
    """Direct-beam visibility at module centre using ray/box slab intersections.

    This is a centre-point approximation, not a partial-module shading solution.
    """
    if not inputs.exclusions:
        return None
    alpha=np.radians(w['altitude']); angle=np.radians(w['azimuth']-inputs.roof_rotation)
    vectors=[np.cos(alpha)*np.sin(angle),np.cos(alpha)*np.cos(angle),np.sin(alpha)]
    visible=[]
    z=PANEL['length_m']*np.sin(np.radians(config.tilt))/2
    for panel in panels:
        origin=[sum(p[0] for p in panel['corners'])/4,sum(p[1] for p in panel['corners'])/4,z]
        blocked=np.zeros(len(alpha),bool)
        for o in inputs.exclusions:
            lower=[o.x,o.y,0];upper=[o.x+o.width,o.y+o.depth,o.height]
            entry=np.full(len(alpha),-np.inf);leave=np.full(len(alpha),np.inf)
            for a in range(3):
                v=vectors[a];parallel=np.abs(v)<1e-9
                near=np.divide(lower[a]-origin[a],v,out=np.zeros_like(v),where=~parallel)
                far=np.divide(upper[a]-origin[a],v,out=np.zeros_like(v),where=~parallel)
                entry=np.maximum(entry,np.where(parallel,-np.inf,np.minimum(near,far)))
                leave=np.minimum(leave,np.where(parallel,np.inf,np.maximum(near,far)))
                if origin[a]<lower[a] or origin[a]>upper[a]:leave=np.where(parallel,-np.inf,leave)
            blocked |= (leave>=np.maximum(entry,0))&(leave>1e-8)
        visible.append(~blocked)
    return np.asarray(visible)


@lru_cache(maxsize=512)
def plane_irradiance(tilt, azimuth, year, scale):
    w=weather(year)
    return pvlib.irradiance.get_total_irradiance(tilt,azimuth,w['zenith'],w['azimuth'],w['dni']*scale,w['ghi']*scale,w['dhi']*scale,
              albedo=SETTINGS['model']['albedo'],model='isotropic')


def scope_warnings(inputs):
    return ['village_house_area'] if inputs.village_house_mode and inputs.house_area>POLICY['village_house_area_limit_m2'] else []


def evaluate(inputs: Inputs, config: Configuration, details=True, economics=True):
    panels, rows, coverage, error=layout(inputs,config)
    count=len(panels); capacity=count*PANEL['power_w']/1000
    violations=[]
    if error: violations.append(error)
    actual_rows=len(rows)
    if actual_rows != config.rows: violations.append('rows_unbuildable')
    # Assumed packing-quality threshold; not a physical/regulatory law.
    # Explicit partial-row caps opt out of this density check, not row-count checks.
    if not config.panel_limit and config.azimuth != 180 and inputs.minimum_row_fill_ratio:
        _, south_rows, _, _=layout(inputs,config.model_copy(update={'azimuth':180}))
        if len(south_rows)==config.rows and any(r['count'] < inputs.minimum_row_fill_ratio*south_rows[i]['count']-1e-8 for i,r in enumerate(rows)):
            if 'rows_unbuildable' not in violations: violations.append('rows_unbuildable')
    if coverage>inputs.house_area*POLICY['coverage_limit']+1e-6: violations.append('coverage')
    load=count*(PANEL['mass_kg']+PANEL['rack_mass_kg']+inputs.extra_mass_per_module)/coverage if coverage else 0
    if load>inputs.load_limit: violations.append('load')
    w=weather(inputs.weather_year); horizon=np.interp(w['azimuth'],np.arange(13)*30,inputs.horizon+[inputs.horizon[0]])
    beam_clear=w['altitude']>horizon
    svf=float(np.mean(np.cos(np.radians(inputs.horizon))**2))
    irrad=plane_irradiance(config.tilt,config.azimuth,inputs.weather_year,inputs.weather_scale)
    direct=np.maximum(0,np.nan_to_num(irrad['poa_direct']))
    diffuse=np.maximum(0,np.nan_to_num(irrad['poa_sky_diffuse']))*svf+np.maximum(0,np.nan_to_num(irrad['poa_ground_diffuse']))
    shade=finite_shading(w['altitude'],w['azimuth'],config,rows) if inputs.finite_rows else shading_fractions(w['altitude'],w['azimuth'],config.tilt,config.azimuth,rows)
    local_clear=obstacle_clearance(inputs,config,panels,w)
    power=np.zeros(len(w['times'])); baseline=np.zeros_like(power); row_losses=[]
    for i,row in enumerate(rows):
        base=direct+np.nan_to_num(irrad['poa_diffuse'])
        visibility=beam_clear.astype(float)
        if local_clear is not None:
            visibility *= local_clear[[j for j,panel in enumerate(panels) if panel['row']==i]].mean(axis=0)
        factor=1-shade[i]
        if inputs.electrical_model=='martinez':
            factor *= 1-np.ceil(shade[i]*inputs.bypass_blocks-1e-12)/(1+inputs.bypass_blocks)
        poa=direct*visibility*factor+diffuse
        def p(g):
            tc=w['temp']+(PANEL['noct_c']-20)/800*g
            return np.maximum(0,PANEL['power_w']/1000*g/1000*(1+PANEL['temp_coefficient']*(tc-25))*SETTINGS['model']['system_efficiency'])
        production=p(poa)*row['count']; unshaded=p(base)*row['count']
        power+=production;baseline+=unshaded
        row_losses.append(round(100*(1-production.sum()/unshaded.sum()),1) if unshaded.sum()>0 else 0)
    monthly=[round(float(power[w['times'].month==m].sum()),2) for m in range(1,13)]
    annual=float(power.sum()); base=float(baseline.sum())
    economy=finance(inputs,capacity,monthly) if economics else {}
    result={'config':config.model_dump(),'panels_count':count,'capacity_kw':round(capacity,3),
            'actual_rows':actual_rows,'requested_rows':config.rows,
            'row_pitch_m':round(rows[0]['y']-rows[1]['y'],4) if len(rows)>1 else None,
            'minimum_clear_gap_m':round(min(rows[i]['y']-rows[i+1]['y'] for i in range(len(rows)-1))-PANEL['length_m']*math.cos(math.radians(config.tilt)),4) if len(rows)>1 else None,
            'annual_kwh':round(annual,1),'specific_yield':round(annual/capacity,1) if capacity else 0,
            'shading_loss_pct':round(100*(1-annual/base),1) if base else 0,
            'coverage_m2':round(coverage,2),'coverage_limit_m2':round(inputs.house_area*POLICY['coverage_limit'],2),
            'load_kg_m2':round(load,2),'load_limit_kg_m2':inputs.load_limit,'weather_year':inputs.weather_year,'model_version':MODEL_VERSION,'compliant':not violations,'violations':violations,
            'warnings':scope_warnings(inputs),
            'monthly_kwh':monthly,**economy}
    if details: result.update(panels=panels,rows=rows,row_losses=row_losses)
    else: result.pop('cashflow',None)
    if economics:
        from .decision import assess
        result['decision']=assess(inputs,result)
    return result


def search(inputs):
    from .decision import recommend
    return recommend(inputs)


def sun_preview(inputs,config,day,hour):
    t=pd.DatetimeIndex([pd.Timestamp(f'{day} 00:00',tz='Asia/Hong_Kong')+pd.Timedelta(hours=hour)])
    pos=pvlib.solarposition.get_solarposition(t,SETTINGS['location']['lat'],SETTINGS['location']['lon'])
    alt=float(pos.apparent_elevation.iloc[0]);az=float(pos.azimuth.iloc[0])
    h=float(np.interp(az,np.arange(13)*30,inputs.horizon+[inputs.horizon[0]]))
    _,rows,_,_=layout(inputs,config)
    fractions=(finite_shading(np.array([alt]),np.array([az]),config,rows) if inputs.finite_rows else shading_fractions([alt],[az],config.tilt,config.azimuth,rows))[:,0].tolist()
    return {'altitude':round(alt,2),'azimuth':round(az,2),'horizon':h,'beam_clear':alt>h,
            'row_shade':fractions,'timestamp':t[0].isoformat()}
