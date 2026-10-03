"""Reproduce vector-curve extraction from Molicel P28A v1.3 (requires pdfplumber).
Usage: python extract_temperature_reference.py path/to/manufacturer.pdf
The PDF is not redistributed. Output retains source conditions and all extracted points.
"""
import json,sys,hashlib
from pathlib import Path
import pdfplumber

source=Path(sys.argv[1])
colors={(1.,.4,0.):-40,(0.,1.,0.):-30,(0.,.8,1.):-20,(1.,0.,1.):0,(0.,0.,1.):23,0.:45,(1.,0.,0.):60}
with pdfplumber.open(source) as pdf:
    curves=[c for c in pdf.pages[0].curves if len(c['pts'])>100 and 420<c['top']<425]
rows=[]
for curve in curves:
    color=curve['stroking_color'];color=tuple(color) if isinstance(color,(tuple,list)) else color
    points=[[(x-370.47548)/(546.35368-370.47548)*3,(521.16748-y)/(521.16748-403.59950)*5] for x,y in curve['pts']]
    assert all(b[0]>=a[0]-1e-6 for a,b in zip(points,points[1:]))
    energy=sum((b[0]-a[0])*(a[1]+b[1])/2 for a,b in zip(points,points[1:]))
    rows.append({'temperature_c':colors[color],'capacity_ah':points[-1][0],'energy_wh':energy,'points_ah_v':[[round(x,6),round(y,6)] for x,y in points]})
rows.sort(key=lambda x:x['temperature_c']);ref=next(x['energy_wh'] for x in rows if x['temperature_c']==23)
for row in rows:row['energy_ratio_to_23c']=row['energy_wh']/ref
data={'source':'https://www.molicel.com/wp-content/uploads/INR18650P28A_1.3_Product-Data-Sheet-of-INR-18650-P28A-80093.pdf','model':'Molicel INR-18650-P28A','version':'1.3','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'PDF vector-curve extraction; trapezoidal integral of voltage over discharged Ah. Linear temperature interpolation; no extrapolation. Curves are manufacturer typical characteristics, not raw independent measurements.','conditions':{'charge_temperature_c':23,'charge_a':2.8,'charge_v':4.2,'charge_cutoff_a':.05,'discharge_a':2.8,'discharge_cutoff_v':2.5},'rows':rows}
dest=Path(__file__).parent/'static/data/p28a-temperature.json';dest.parent.mkdir(exist_ok=True,parents=True);dest.write_text(json.dumps(data,indent=2),encoding='utf-8')
print([(r['temperature_c'],round(r['energy_wh'],3),round(r['energy_ratio_to_23c'],3)) for r in rows])
