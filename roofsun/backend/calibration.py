"""Read reproducible HKO scaling outputs; never fall back to an invented ratio."""
from functools import lru_cache
import json
from pathlib import Path

@lru_cache(maxsize=1)
def calibration():
    return json.loads((Path(__file__).resolve().parents[1]/'data/hko_check.json').read_text())

def weather_ratio(year=2025):
    return next(item['ratio'] for item in calibration()['years'] if item['year']==year)
