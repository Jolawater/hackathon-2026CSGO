import math
import numpy as np
import pandas as pd
import pvlib
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, box
from backend.app import app
from backend.model import Inputs, Configuration, PANEL, evaluate, finance, layout, search, shading_fractions, sun_preview, weather


def test_nrel_published_solar_benchmark():
    p=pvlib.solarposition.spa_python(pd.DatetimeIndex(['2003-10-17T12:30:30-07:00']),39.742476,-105.1786,altitude=1830,pressure=82000,temperature=11,delta_t=67)
    assert p.apparent_zenith.iloc[0]==pytest.approx(50.111622,abs=1e-5)
    assert p.azimuth.iloc[0]==pytest.approx(194.340241,abs=1e-5)


@pytest.mark.parametrize('azimuth',[90,120,165,180,210,270])
def test_rotated_modules_stay_inside_roof(azimuth):
    inputs=Inputs(roof_rotation=17)
    panels,rows,coverage,error=layout(inputs,Configuration(azimuth=azimuth,tilt=30,rows=2))
    assert panels and not error
    allowed=box(.5,.5,7.5,5.5).buffer(1e-7)
    for panel in panels: assert allowed.covers(Polygon(panel['corners']))
    for i,panel in enumerate(panels):
        for other in panels[i+1:]:assert Polygon(panel['corners']).intersection(Polygon(other['corners'])).area<1e-7


def test_row_shading_against_reference():
    # Independently implemented ray/plane relation compared with pvlib's reference implementation.
    for altitude in [5,10,20,40,75]:
        for azimuth in [100,135,180,220,260]:
            expected=pvlib.shading.shaded_fraction1d(solar_zenith=90-altitude,solar_azimuth=azimuth,axis_azimuth=90,shaded_row_rotation=30,collector_width=PANEL['length_m'],pitch=3,axis_tilt=0,surface_to_axis_offset=0,cross_axis_slope=0)
            observed=shading_fractions([altitude],[azimuth],30,180,[{'y':3,'count':1},{'y':0,'count':1}])[1,0]
            assert observed==pytest.approx(expected,abs=1e-9)


def test_weather_completeness_and_units():
    w=weather()
    assert len(w['ghi'])==8760
    assert str(w['times'].tz)=='Asia/Hong_Kong'
    assert np.isfinite(w['ghi']).all() and (w['ghi']>=0).all()
    assert w['ghi'][w['altitude']<=0].sum()==0


def test_energy_aggregation_and_more_shade_reduces_output():
    clean=evaluate(Inputs(),Configuration())
    shaded=evaluate(Inputs(horizon=[40]*12),Configuration())
    assert sum(clean['monthly_kwh'])==pytest.approx(clean['annual_kwh'],abs=.12)
    assert 0<shaded['annual_kwh']<clean['annual_kwh']
    assert shaded['shading_loss_pct']>clean['shading_loss_pct']


def test_small_roof_has_no_modules_or_recommendations():
    small=Inputs(width=1,depth=1)
    result=evaluate(small,Configuration())
    assert result['panels_count']==0 and result['annual_kwh']==0
    assert not result['compliant']
    assert search(small)['recommendations']=={}


def test_coverage_failure_is_excluded_from_search():
    inputs=Inputs(house_area=48)
    result=evaluate(inputs,Configuration())
    assert 'coverage' in result['violations']
    assert all(r['coverage_m2']<=24.01 for r in search(inputs)['configs'])


def test_night_and_front_row_shadows():
    sun=sun_preview(Inputs(),Configuration(),pd.Timestamp('2025-12-21').date(),0)
    assert sun['altitude']<0 and not sun['beam_clear']
    day=sun_preview(Inputs(),Configuration(),pd.Timestamp('2025-12-21').date(),12)
    assert day['row_shade'][0]==0 and day['row_shade'][1]>0


def test_financial_cutoff_and_replacement():
    inputs=Inputs(commissioning='2033-12-01',price_per_kw=10000,fixed_cost=0,annual_om=0,inverter_cost=500)
    result=finance(inputs,1,[100]*12)
    # Only the December 2033 interval earns FiT. Replacement is a single cash-flow jump.
    assert result['cashflow'][1]['A']==pytest.approx(-9600)
    assert result['net_A']==pytest.approx(-10100)
    assert result['net_B']>result['net_A']
    assert result['payback_A'] is None
    assert finance(inputs.model_copy(update={'self_use_share':0}),1,[100]*12)['net_B']==pytest.approx(result['net_A'])


def test_frontier_really_is_non_dominated():
    results=search(Inputs())
    assert results['frontier']
    for r in results['frontier']:
        assert not any(other['initial_cost']<=r['initial_cost'] and other['annual_kwh']>=r['annual_kwh'] and
                       (other['initial_cost']<r['initial_cost'] or other['annual_kwh']>r['annual_kwh']) for other in results['configs'])


def test_api_rejects_invalid_inputs_and_returns_real_results():
    client=TestClient(app)
    assert client.post('/api/evaluate',json={'inputs':{'horizon':[90]*12}}).status_code==422
    assert client.post('/api/evaluate',json={'inputs':{'width':20,'house_area':10}}).status_code==422
    assert client.post('/api/evaluate',json={'config':{'rows':0}}).status_code==422
    assert client.post('/api/evaluate',json={'inputs':{'commissioning':'2034-01-01'}}).status_code==422
    assert client.post('/api/sun',json={'day':'not-a-date'}).status_code==422
    result=client.post('/api/evaluate',json={})
    assert result.status_code==200 and result.json()['annual_kwh']>0
