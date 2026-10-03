"""Reproduce King's Park / NASA annual ratios from bundled source CSVs.

Use --download only to explicitly refresh the public HKO source. Runtime uses
bundled data; no rounded ratio from a document is substituted for observations.
"""
import argparse
import calendar
import csv
import hashlib
import io
import json
import math
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SOURCE_URL='https://data.weather.gov.hk/weatherAPI/cis/csvfile/KP/ALL/daily_KP_GSR_ALL.csv'

def calculate(root=ROOT):
    path=root/'data/hko_kp_daily_gsr.csv'
    source=path.read_bytes()
    text=source.decode('utf-8-sig')
    years={year:{} for year in (2023,2024,2025)}
    flags={year:[] for year in years}
    for row in csv.reader(io.StringIO(text)):
        if len(row)<4:continue
        try:year,month,day=(int(x.strip()) for x in row[:3])
        except ValueError:continue
        if year not in years:continue
        stamp=date(year,month,day).isoformat()
        raw=row[3].strip()
        try:value=float(raw.replace('#','').replace('*','').strip())
        except ValueError:raise ValueError(f'Missing HKO measurement on {stamp}; do not substitute an annual estimate')
        if not math.isfinite(value) or value<0:raise ValueError(f'Invalid HKO measurement on {stamp}')
        if stamp in years[year]:raise ValueError(f'Duplicate HKO date: {stamp}')
        years[year][stamp]=value
        if '#' in ','.join(row[3:]):flags[year].append(stamp)
    results=[]
    for year,observations in years.items():
        expected=366 if calendar.isleap(year) else 365
        if len(observations)!=expected:raise ValueError(f'{year}: expected {expected} HKO days, received {len(observations)}')
        weather_path=root/f'data/weather_{year}.csv'
        with weather_path.open() as f:nasa=sum(float(r['ghi_wm2']) for r in csv.DictReader(f))/1000
        hko=sum(observations.values())/3.6
        results.append({'year':year,'days':len(observations),'hko_kwh_m2':hko,'nasa_kwh_m2':nasa,
                        'ratio':hko/nasa,'flagged_days':flags[year],
                        'nasa_sha256':hashlib.sha256(weather_path.read_bytes()).hexdigest()})
    combined=sum(r['hko_kwh_m2'] for r in results)/sum(r['nasa_kwh_m2'] for r in results)
    return {'source_url':SOURCE_URL,'source_sha256':hashlib.sha256(source).hexdigest(),
            'source_units':'MJ/m² per day; divide by 3.6 for kWh/m²',
            'acquisition':'Original daily_KP_GSR_ALL.csv supplied by the user on 2026-10-03; bundled unchanged, not downloaded by this run.',
            'flag_policy':'Reported daily totals marked # are retained and counted; they are incomplete observations, not filled or invented values.',
            'scope':'Annual scaling of NASA hourly shape to King\'s Park totals. Different locations and local/UTC calendar boundaries; not measured PV accuracy or a confidence interval.',
            'years':results,'combined_ratio':combined}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true');args=parser.parse_args()
    if args.download:
        import requests
        response=requests.get(SOURCE_URL,timeout=60);response.raise_for_status()
        (ROOT/'data/hko_kp_daily_gsr.csv').write_bytes(response.content)
    report=calculate()
    (ROOT/'data/hko_check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    for record in report['years']:
        print(f"{record['year']}: HKO={record['hko_kwh_m2']:.3f}, NASA={record['nasa_kwh_m2']:.3f} kWh/m²; ratio={record['ratio']:.6f}; flagged days={len(record['flagged_days'])}")
    print(f"Combined ratio: {report['combined_ratio']:.6f}")
