from datetime import date
from pathlib import Path
import json
import hashlib
from .reference import irradiance_check, measured_case, Measurement
from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import Field, ValidationError
from .model import Evaluation, Inputs, evaluate, search, sun_preview, ROOT, SETTINGS, MODEL_VERSION
from .screening import ScreeningRequest, SevenInputs, screen, analyse_seven, import_owner
from .calibration import calibration

app=FastAPI(title='RoofSun HK', version=MODEL_VERSION)
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

@app.get('/api/health')
def health(): return {'status':'ok','model_version':MODEL_VERSION,'weather_available':all((ROOT/f'data/weather_{y}.csv').is_file() for y in [2023,2024,2025])}

@lru_cache(maxsize=1)
def source_metadata():
    years={}
    for y in [2023,2024,2025]:
        path=ROOT/('data/weather_metadata.json' if y==2025 else f'data/weather_metadata_{y}.json')
        years[str(y)]={**json.loads(path.read_text()), 'csv_sha256':hashlib.sha256((ROOT/f'data/weather_{y}.csv').read_bytes()).hexdigest()}
    return {'settings':SETTINGS,'model_version':MODEL_VERSION,'weather':years['2025'],'weather_years':years,'roof_presets':json.loads((ROOT/'data/roof_presets.json').read_text()),'irradiance_checks':{str(y):irradiance_check(y) for y in [2023,2024,2025]}}

@app.get('/api/meta')
def meta(): return {**source_metadata(),'calibration':calibration(),'owner_defaults':SevenInputs().model_dump()}

@app.post('/api/evaluate')
def api_evaluate(request:Evaluation):
    result=evaluate(request.inputs,request.config)
    result['winter_solstice_noon']=sun_preview(request.inputs,request.config,date(2025,12,21),12)
    rows=request.config.rows
    counts=[rows-1,rows] if rows>1 else [1,2]
    result['row_comparison']=[evaluate(request.inputs,request.config.model_copy(update={'rows':n}),False) for n in counts]
    return result

@app.post('/api/simulate')
def api_simulate(inputs:Inputs): return search(inputs)

@app.post('/api/analyse')
def api_analyse(payload:dict):
    # Choose the archive/API shape before validation so malformed owner inputs
    # cannot fall through to a legacy model that ignores unknown fields.
    original=payload.get('inputs',{})
    owner_keys=set(SevenInputs.model_fields)-{'price_per_kw','post_fit'}
    owner_shape=('config' not in payload and not original) or (isinstance(original,dict) and bool(owner_keys & original.keys()))
    try:
        if owner_shape:return analyse_seven(ScreeningRequest.model_validate(payload))
        request=Evaluation.model_validate(payload)
    except ValidationError as exc:raise HTTPException(422,exc.errors(include_context=False)) from exc
    from .reliability import analyse
    return analyse(request.inputs, request.config)

@app.post('/api/screen')
def api_screen(request:ScreeningRequest):return screen(request)

@app.post('/api/import-owner')
def api_import_owner(payload:dict):
    try:
        owner,migrated=import_owner(payload)
        return {'inputs':owner.model_dump(),'model_version':MODEL_VERSION,'migrated':migrated,
                'neighbour_reset':migrated,'notice':'fixed_assumptions_recalculated'}
    except (ValueError,TypeError,KeyError) as exc:raise HTTPException(422,str(exc)) from exc

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

@app.get('/api/validation')
def validation():
    path=ROOT/'data/validation.json'
    if not path.exists():raise HTTPException(503,'Validation report has not been generated; run scripts/validate.py')
    return json.loads(path.read_text())

# Production build and API share one origin; no Node process or external API needed at runtime.
if (ROOT/'dist').exists():app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='website')
