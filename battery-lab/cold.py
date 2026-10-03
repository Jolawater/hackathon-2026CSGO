"""Manufacturer curve integration, used only as a disclosed reference-cell transfer."""
import json
from pathlib import Path
DATA=json.loads((Path(__file__).parent/'static/data/p28a-temperature.json').read_text())
def cold_factor(temperature):
    rows=DATA['rows']
    if not rows[0]['temperature_c'] <= temperature <= rows[-1]['temperature_c']:
        raise ValueError('Outside reference temperature range; no extrapolation.')
    base=next(r['energy_wh'] for r in rows if r['temperature_c']==23)
    for a,b in zip(rows,rows[1:]):
        if a['temperature_c'] <= temperature <= b['temperature_c']:
            f=(temperature-a['temperature_c'])/(b['temperature_c']-a['temperature_c'])
            return min(1,(a['energy_wh']+f*(b['energy_wh']-a['energy_wh']))/base)
    return min(1,rows[0]['energy_wh']/base)
