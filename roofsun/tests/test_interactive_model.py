import copy
import numpy as np
import pytest
from backend.model import Inputs, Configuration, layout, evaluate
from backend.finance import cashflows
from backend.model import SETTINGS


def test_selected_period_changes_finances_not_first_year_energy():
    inputs=Inputs(width=12,depth=10,house_area=130,village_house_mode=False,price_per_kw=5000)
    config=Configuration(rows=2)
    short=evaluate(inputs.model_copy(update={'analysis_years':5}),config)
    long=evaluate(inputs.model_copy(update={'analysis_years':25}),config)
    assert short['annual_kwh']==long['annual_kwh']
    assert short['cashflow'][-1]['date']=='2031-12-31'
    assert long['cashflow'][-1]['date']=='2051-12-31'
    assert len(short['cashflow'])<len(long['cashflow'])
    assert short['npv_A']!=long['npv_A']


def test_translation_preserves_geometry_and_cached_original():
    inputs=Inputs(width=12,depth=10,house_area=130,village_house_mode=False)
    config=Configuration(rows=2,panel_limit=4)
    original=copy.deepcopy(layout(inputs,config))
    moved=layout(inputs,config.model_copy(update={'offset_x':.2,'offset_y':0}))
    assert moved[3] is None and len(moved[0])==len(original[0])
    np.testing.assert_allclose(np.array(moved[0][0]['corners'])-np.array(original[0][0]['corners']),np.tile([.2,0],(4,1)))
    assert layout(inputs,config)==original
    assert moved[2]==original[2]


def test_invalid_placement_never_produces_feasible_energy():
    result=evaluate(Inputs(),Configuration(offset_x=25))
    assert 'placement_invalid' in result['violations']
    assert not result['compliant'] and result['annual_kwh']==0


def test_period_does_not_include_future_replacement():
    inputs=Inputs(analysis_years=5,inverter_cost=9000)
    a=cashflows(inputs,4,[300]*12,SETTINGS)
    b=cashflows(inputs.model_copy(update={'inverter_cost':0}),4,[300]*12,SETTINGS)
    assert a['net_A']==b['net_A']


@pytest.mark.parametrize('value',[0,26])
def test_period_range(value):
    with pytest.raises(ValueError):Inputs(analysis_years=value)


def test_demand_is_a_constraint_not_extra_revenue():
    base=Inputs(width=12,depth=10,house_area=130,village_house_mode=False)
    config=Configuration(rows=2)
    without=evaluate(base,config)
    target=evaluate(base.model_copy(update={'monthly_demand_kwh':100000}),config)
    assert 'energy_target' in target['decision']['reasons']
    assert not target['decision']['eligible']
    assert without['annual_kwh']==target['annual_kwh']
    assert without['npv_A']==target['npv_A']


def test_daily_track_matches_existing_solar_position():
    from datetime import date
    from backend.app import api_sun_track, SunTrackRequest
    from backend.model import sun_preview
    request=SunTrackRequest(day=date(2025,6,15))
    track=api_sun_track(request)
    assert len(track['samples'])==97
    assert track['samples'][0]['altitude']<0
    noon=track['samples'][48]
    reference=sun_preview(request.inputs,request.config,request.day,12)
    assert abs(noon['altitude']-reference['altitude'])<.01
    assert abs(noon['azimuth']-reference['azimuth'])<.01
    assert noon['beam_clear'] is True
