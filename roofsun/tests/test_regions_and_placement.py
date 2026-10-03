import numpy as np
import pytest
from backend.model import Inputs, Configuration, PanelPosition, Neighbour, layout, evaluate, weather, SETTINGS
from backend.finance import cashflows


@pytest.mark.parametrize('region', ['shenzhen', 'london'])
def test_region_weather_and_finances(region):
    local=Inputs(region=region, price_per_kw=1000, fixed_cost=0, annual_om=0,
                 inverter_cost=0, import_rate=.3, export_rate=.1, local_self_use_share=.5)
    out=evaluate(local, Configuration(rows=2))
    assert out['annual_kwh']>0 and out['currency']==('CNY' if region=='shenzhen' else 'GBP')
    for year in (2023,2024,2025):
        assert len(weather(year,region)['ghi'])==(8784 if year==2024 else 8760)
    cash=cashflows(local,1,[100]*12,SETTINGS)
    # 2034 remains remunerated under the user-entered local contract scenario.
    records={r['date']:r['A'] for r in cash['cashflow']}
    assert records['2034-01-31']>records['2033-12-31']
    first=100*((.3+.1)/2)-1000
    assert cash['cashflow'][1]['A']==pytest.approx(first,abs=.01)


def test_manual_centres_preserve_layout_energy_and_reject_overlap():
    i=Inputs(minimum_row_fill_ratio=0)
    c=Configuration(rows=2,tilt=20,azimuth=180)
    original=layout(i,c)
    centres=[PanelPosition(x=np.mean([x for x,y in p['corners']]),y=np.mean([y for x,y in p['corners']])) for p in original[0]]
    manual=c.model_copy(update={'manual_panels':centres})
    assert len(layout(i,manual)[0])==len(original[0])
    assert evaluate(i,manual)['annual_kwh']==pytest.approx(evaluate(i,c)['annual_kwh'],rel=1e-4)
    bad=c.model_copy(update={'manual_panels':[centres[0],centres[0]]})
    assert 'placement_invalid' in evaluate(i,bad)['violations']


def test_neighbour_shade_and_validation():
    clear=Inputs()
    blocked=Inputs(neighbours=[Neighbour(x=-3,y=-12,width=15,depth=10,height=20)])
    c=Configuration(rows=2)
    assert evaluate(blocked,c)['annual_kwh']<evaluate(clear,c)['annual_kwh']
    with pytest.raises(ValueError):Inputs(neighbours=[Neighbour(x=1,y=1,width=2,depth=2,height=10)])
