from datetime import date
from pathlib import Path
import json
import hashlib
from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from .model import Evaluation, Inputs, evaluate, search, sun_preview, ROOT, SETTINGS

app=FastAPI(title='RoofSun HK', version='2.0.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

@app.get('/api/health')
def health(): return {'status':'ok','model_version':'2.0.0','weather_available':all((ROOT/f'data/weather_{y}.csv').is_file() for y in [2023,2024,2025])}

@lru_cache(maxsize=1)
def source_metadata():
    years={}
    for y in [2023,2024,2025]:
        path=ROOT/('data/weather_metadata.json' if y==2025 else f'data/weather_metadata_{y}.json')
        years[str(y)]={**json.loads(path.read_text()), 'csv_sha256':hashlib.sha256((ROOT/f'data/weather_{y}.csv').read_bytes()).hexdigest()}
    return {'settings':SETTINGS,'model_version':'2.0.0','weather':years['2025'],'weather_years':years}

@app.get('/api/meta')
def meta(): return source_metadata()

@app.post('/api/evaluate')
def api_evaluate(request:Evaluation):
    result=evaluate(request.inputs,request.config)
    rows=request.config.rows
    counts=[rows-1,rows] if rows>1 else [1,2]
    result['row_comparison']=[evaluate(request.inputs,request.config.model_copy(update={'rows':n}),False) for n in counts]
    return result

@app.post('/api/simulate')
def api_simulate(inputs:Inputs): return search(inputs)

@app.post('/api/analyse')
def api_analyse(request:Evaluation):
    from .reliability import analyse
    return analyse(request.inputs, request.config)

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
