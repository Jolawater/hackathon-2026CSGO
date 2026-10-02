from datetime import date
from pathlib import Path
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import Field
from .model import Evaluation, Inputs, evaluate, search, sun_preview, ROOT, SETTINGS

app=FastAPI(title='RoofSun HK', version='1.0.0')
app.add_middleware(CORSMiddleware,allow_origins=['http://127.0.0.1:5173','http://localhost:5173'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])

@app.get('/api/health')
def health(): return {'status':'ok','weather_available':(ROOT/'data/weather_2025.csv').is_file()}

@app.get('/api/meta')
def meta():
    return {'settings':SETTINGS,'weather':json.loads((ROOT/'data/weather_metadata.json').read_text())}

@app.post('/api/evaluate')
def api_evaluate(request:Evaluation): return evaluate(request.inputs,request.config)

@app.post('/api/simulate')
def api_simulate(inputs:Inputs): return search(inputs)

class SunRequest(Evaluation):
    day:date=date(2025,12,21)
    hour:float=Field(default=12,ge=0,le=23.99)

@app.post('/api/sun')
def api_sun(request:SunRequest):
    return sun_preview(request.inputs,request.config,request.day,request.hour)

@app.get('/api/validation')
def validation():
    path=ROOT/'data/validation.json'
    if not path.exists():raise HTTPException(503,'Validation report has not been generated; run scripts/validate.py')
    return json.loads(path.read_text())

# Production build and API share one origin; no Node process or external API needed at runtime.
if (ROOT/'dist').exists():app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='website')
