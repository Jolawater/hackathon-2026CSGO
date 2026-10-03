"""Explicit source acquisition; never substitute Hong Kong weather for another city."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json
import requests
import pandas as pd

ROOT=Path(__file__).resolve().parents[1]
REGIONS=json.loads((ROOT/'data/regions.json').read_text(encoding='utf-8'))

def download(item):
    region,year=item
    loc=REGIONS[region]
    target=ROOT/f'data/weather_{region}_{year}.csv'
    if target.exists():return f'{region} {year}: already present'
    params={'parameters':'ALLSKY_SFC_SW_DWN,T2M','community':'RE','latitude':loc['lat'],'longitude':loc['lon'],'start':f'{year}0101','end':f'{year}1231','format':'JSON','time-standard':'UTC'}
    response=requests.get('https://power.larc.nasa.gov/api/temporal/hourly/point',params=params,timeout=120)
    response.raise_for_status()
    payload=response.json();series=payload['properties']['parameter'];keys=sorted(series['T2M'])
    frame=pd.DataFrame({'timestamp':pd.to_datetime(keys,format='%Y%m%d%H',utc=True),'ghi_wm2':[series['ALLSKY_SFC_SW_DWN'][k] for k in keys],'temp_c':[series['T2M'][k] for k in keys]})
    if len(frame)!=(8784 if year%4==0 else 8760) or frame.isna().any().any() or (frame[['ghi_wm2','temp_c']]<-900).any().any():raise ValueError('Incomplete NASA source data')
    frame.to_csv(target,index=False)
    meta={'provider':'NASA POWER','source_url':response.url,'year':year,**loc,'hours':len(frame),'time_standard':'UTC','parameters':payload.get('parameters',{}),'header':payload.get('header',{}),'note':'Reference city grid point, not measured rooftop weather. UTC calendar year converted to local time; annual repetition is a scenario, not a forecast.'}
    (ROOT/f'data/weather_{region}_{year}_metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    return f'{region} {year}: {len(frame)} source hours'

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(download,[(region,year) for region in ['shenzhen','london'] for year in [2023,2024,2025]]):print(result,flush=True)
