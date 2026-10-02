from pathlib import Path
from functools import lru_cache
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from engine import Scenario, simulate, compare
from aging import AgingInput, aging
from catalog import catalog

app = FastAPI(title="Battery Choices", version="1.0.0")
ROOT = Path(__file__).parent

@app.get("/api/catalog")
def get_catalog():
    return catalog()

@app.post("/api/simulate")
def post_simulate(s: Scenario):
    return simulate(s)

@app.post("/api/compare")
def post_compare(s: Scenario):
    return compare(s)

@app.post("/api/aging")
def post_aging(s: AgingInput):
    return aging(s)

@app.get("/api/validation")
@lru_cache(maxsize=1)
def get_validation():
    from validation import run_validation
    return run_validation()

@app.get("/")
def home():
    return FileResponse(ROOT / "static" / "index.html")

app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
