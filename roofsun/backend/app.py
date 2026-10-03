from datetime import date
from pathlib import Path
import json
import hashlib
from .reference import irradiance_check, measured_case, Measurement
from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from .model import Evaluation, Inputs, evaluate, search, sun_preview, ROOT, SETTINGS

app=FastAPI(title='RoofSun HK', version='2.4.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

@app.get('/api/health')
def health(): return {'status':'ok','model_version':'2.4.0','weather_available':all((ROOT/f'data/weather_{y}.csv').is_file() for y in [2023,2024,2025])}

@lru_cache(maxsize=1)
def source_metadata():
    years={}
    for y in [2023,2024,2025]:
        path=ROOT/('data/weather_metadata.json' if y==2025 else f'data/weather_metadata_{y}.json')
        years[str(y)]={**json.loads(path.read_text()), 'csv_sha256':hashlib.sha256((ROOT/f'data/weather_{y}.csv').read_bytes()).hexdigest()}
    return {'settings':SETTINGS,'model_version':'2.4.0','weather':years['2025'],'weather_years':years,'roof_presets':json.loads((ROOT/'data/roof_presets.json').read_text()),'irradiance_checks':{str(y):irradiance_check(y) for y in [2023,2024,2025]}}

@app.get('/api/regions')
def regional_metadata():
    from .model import REGIONS
    result={}
    for region,location in REGIONS.items():
        if region=='hong_kong':continue
        years={}
        for year in (2023,2024,2025):
            metadata=json.loads((ROOT/f'data/weather_{region}_{year}_metadata.json').read_text(encoding='utf-8'))
            metadata['csv_sha256']=hashlib.sha256((ROOT/f'data/weather_{region}_{year}.csv').read_bytes()).hexdigest()
            years[str(year)]=metadata
        result[region]={**location,'weather_years':years,'finance_scope':'User-entered constant import/export rates; disjoint self-use/export; no tax/subsidy forecast or engineering approval'}
    return result

@app.get('/api/meta')
def meta(): return source_metadata()

@app.post('/api/evaluate')
def api_evaluate(request:Evaluation):
    result=evaluate(request.inputs,request.config)
    rows=request.config.rows
    counts=[rows-1,rows] if rows>1 else [1,2]
    result['row_comparison']=[] if request.config.manual_panels is not None else [evaluate(request.inputs,request.config.model_copy(update={'rows':n}),False) for n in counts]
    return result

@app.post('/api/simulate')
def api_simulate(inputs:Inputs): return search(inputs)

@app.post('/api/analyse')
def api_analyse(request:Evaluation):
    from .reliability import analyse
    return analyse(request.inputs, request.config)

class MeasuredRequest(Evaluation):
    measurement: Measurement

@app.post('/api/reference-case')
def api_reference_case(request:MeasuredRequest):
    try:return measured_case(request.inputs,request.config,request.measurement)
    except ValueError as exc:raise HTTPException(422,str(exc)) from exc

class SunRequest(Evaluation):
    day:date=date(2025,12,21)
    hour:float=Field(default=12,ge=0,le=23.99)

@app.post('/api/sun')
def api_sun(request:SunRequest):
    result=sun_preview(request.inputs,request.config,request.day,request.hour)
    from .model import layout,obstacle_clearance
    import numpy as np
    panels,_,_,_=layout(request.inputs,request.config)
    clear=obstacle_clearance(request.inputs,request.config,panels,{'altitude':np.array([result['altitude']]),'azimuth':np.array([result['azimuth']])})
    result['panel_obstacle_clear']=clear[:,0].tolist() if clear is not None else [True]*len(panels)
    return result

class SunTrackRequest(Evaluation):
    day:date=date(2025,12,15)

@app.post('/api/sun-track')
def api_sun_track(request:SunTrackRequest):
    """One vectorized SPA call for a scrub/playable day; no annual energy search."""
    import pandas as pd
    import numpy as np
    import pvlib
    from .model import REGIONS
    loc=REGIONS[request.inputs.region]
    times=pd.date_range(pd.Timestamp(request.day,tz=loc['timezone']),periods=97,freq='15min')
    pos=pvlib.solarposition.get_solarposition(times,loc['lat'],loc['lon'])
    samples=[]
    for i,(alt,az) in enumerate(zip(pos.apparent_elevation,pos.azimuth)):
        horizon=float(np.interp(az,np.arange(13)*30,request.inputs.horizon+[request.inputs.horizon[0]]))
        samples.append({'hour':i/4,'altitude':float(alt),'azimuth':float(az),'horizon':horizon,'beam_clear':bool(alt>horizon)})
    return {'day':request.day.isoformat(),'timezone':loc['timezone'],'step_minutes':15,'source':'pvlib NREL SPA; interpolated for display only','samples':samples}

@app.get('/api/validation')
def validation():
    path=ROOT/'data/validation.json'
    if not path.exists():raise HTTPException(503,'Validation report has not been generated; run scripts/validate.py')
    from .validation_status import report_status
    from .model import MODEL_VERSION
    report = json.loads(path.read_text(encoding='utf-8'))
    report['freshness'] = report_status(report, ROOT, MODEL_VERSION)
    return report

# Production build and API share one origin; no Node process or external API needed at runtime.
if (ROOT/'dist').exists():app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='website')
