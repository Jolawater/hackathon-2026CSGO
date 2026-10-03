"""Bundled NASA POWER climatology; air conditions only, never a latitude aging factor."""
import json
from pathlib import Path
DATA=json.loads((Path(__file__).parent/'static/data/regional-climate.json').read_text(encoding='utf-8'))
def monthly_reference(region,month):
    place=next(p for p in DATA['places'] if p['id']==region)
    return place,place['months'][month-1]
