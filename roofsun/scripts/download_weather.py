"""Fetch and commit source data explicitly; runtime never downloads weather."""
from pathlib import Path
import json
import requests
import pandas as pd
import argparse
parser=argparse.ArgumentParser()
parser.add_argument("--year",type=int,default=2025)
year=parser.parse_args().year

ROOT = Path(__file__).resolve().parents[1]
params = dict(parameters="ALLSKY_SFC_SW_DWN,T2M", community="RE", latitude=22.45,
              longitude=114.16, start=f"{year}0101", end=f"{year}1231", format="JSON", **{"time-standard":"UTC"})
url = "https://power.larc.nasa.gov/api/temporal/hourly/point"
r = requests.get(url, params=params, timeout=120)
r.raise_for_status()
payload = r.json()
series = payload["properties"]["parameter"]
keys = list(series["T2M"])
frame = pd.DataFrame({"timestamp":pd.to_datetime(keys, format="%Y%m%d%H", utc=True),
                      "ghi_wm2":[series["ALLSKY_SFC_SW_DWN"][k] for k in keys],
                      "temp_c":[series["T2M"][k] for k in keys]})
if len(frame) != (8784 if year % 4 == 0 else 8760) or (frame[['ghi_wm2','temp_c']] < -900).any().any():
    raise ValueError("Incomplete weather dataset; do not silently substitute fabricated data")
# POWER hourly Wh/m² over a one-hour interval is numerically equal to its mean W/m².
frame.to_csv(ROOT / f"data/weather_{year}.csv", index=False)
meta = {"provider":"NASA POWER", "source_url":r.url, "year":year,
        "lat":22.45,"lon":114.16,"time_standard":"UTC", "hours":len(frame),
        "parameters":payload.get('parameters',{}), "header":payload.get('header',{}),
        "note":"Gridded satellite/model weather at one reference point, not rooftop measurements. Hourly means; geometry evaluated at interval midpoint. All roofs use this reference weather; local shading is user-defined."}
(ROOT/('data/weather_metadata.json' if year==2025 else f'data/weather_metadata_{year}.json')).write_text(json.dumps(meta, ensure_ascii=False, indent=2))
print(f"Saved {len(frame)} observed/modelled weather hours")
