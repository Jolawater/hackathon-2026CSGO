"""Refresh the bundled NASA POWER reference; not called during normal app use."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

PLACES=[('singapore','新加坡 · 赤道附近','Singapore · near equator',1.3521,103.8198),
        ('hong_kong','香港 · 亚热带','Hong Kong · subtropical',22.3,114.2),
        ('helsinki','赫尔辛基 · 高纬度','Helsinki · high latitude',60.1699,24.9384)]
MONTHS='JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split()
def fetch(place):
    id,zh,en,lat,lon=place
    url=f'https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,RH2M&community=SB&longitude={lon}&latitude={lat}&format=JSON'
    with urlopen(url,timeout=40) as response:raw=response.read()
    data=json.loads(raw)
    assert 'January 2001 - December 2020' in data['header']['range'], 'Review changed climatology period before refreshing.'
    params=data['properties']['parameter']
    months=[{'month':i+1,'temperature_c':params['T2M'][m],'humidity_pct':params['RH2M'][m]} for i,m in enumerate(MONTHS)]
    assert all(-40<=m['temperature_c']<=60 and 0<=m['humidity_pct']<=100 for m in months)
    return dict(id=id,title={'zh':zh,'en':en},latitude=lat,longitude=lon,source=url,
                response_sha256=hashlib.sha256(raw).hexdigest(),header=data['header'],parameters=data['parameters'],months=months)
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=3) as pool:places=list(pool.map(fetch,PLACES))
    data={'source':'NASA POWER / MERRA-2','period':'2001–2020',
          'documentation':'https://power.larc.nasa.gov/docs/services/api/temporal/climatology/',
          'notice':'Gridded long-term monthly mean, not station measurements, current weather, or cell temperature.',
          'places':places}
    path=Path(__file__).parent/'static/data/regional-climate.json'
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print([(p['id'],p['months'][0]) for p in places])
