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


def test_budget_and_late_start_can_reject_every_installation():
    for inputs in [Inputs(budget=1000), Inputs(commissioning='2032-01-01')]:
        result=search(inputs)
        assert result['configs']
        assert result['eligible_count']==0
        assert result['recommendations']=={}
        assert result['verdict']=='defer_installation'
        assert result['no_install']['initial_cost']==0
        assert result['no_install']['npv_A']==0


def test_optional_financial_goals_and_budget_remain_distinct():
    inputs=Inputs(commissioning='2032-01-01',require_profit=False,max_payback_years=0,budget=70000)
    result=search(inputs)
    assert result['recommendations']
    assert all(r['initial_cost']<=70000 for r in result['recommendations'].values())
    assert all(r['decision']['eligible'] for r in result['recommendations'].values())


def test_physical_cache_survives_quote_budget_and_date_edits():
    from backend.decision import physical_search
    physical_search.cache_clear()
    original=search(Inputs())
    misses=physical_search.cache_info().misses
    revised=search(Inputs(price_per_kw=30000,budget=80000,commissioning='2028-01-01'))
    assert physical_search.cache_info().misses==misses
    assert revised['physical_cache_hit']
    assert [(r['config'],r['annual_kwh']) for r in original['configs']]==[(r['config'],r['annual_kwh']) for r in revised['configs']]
    assert original['configs'][0]['initial_cost']!=revised['configs'][0]['initial_cost']


def test_npv_matches_single_known_cash_receipt():
    inputs=Inputs(commissioning='2033-12-01',price_per_kw=10000,fixed_cost=0,annual_om=0,inverter_cost=0,discount_rate=.04)
    r=finance(inputs,1,[100]*12)
    expected=-10000+400/(1.04)**(31/365.2425)
    assert r['npv_A']==pytest.approx(expected,abs=.01)
    assert r['net_to_fit_end']==-9600


def test_first_payback_does_not_promise_persistent_payback():
    inputs=Inputs(commissioning='2033-12-01',price_per_kw=2000,fixed_cost=0,annual_om=0,inverter_cost=5000)
    r=finance(inputs,1,[1000]*12)
    assert r['payback_A']=='2033-12-31'
    assert r['stable_payback_A'] is None
    assert r['net_A']==-3000


def test_tariff_cliff_can_make_more_generation_less_profitable():
    inputs=Inputs(width=10,depth=8,house_area=150)
    a=evaluate(inputs,Configuration(rows=3));b=evaluate(inputs,Configuration(rows=4))
    assert a['capacity_kw']<=10<b['capacity_kw']
    assert a['fit_rate']==4 and b['fit_rate']==3
    assert b['annual_kwh']>a['annual_kwh']
    assert b['net_A']<a['net_A']


def test_extra_mass_can_make_load_constraint_binding():
    result=evaluate(Inputs(extra_mass_per_module=400),Configuration())
    assert result['load_kg_m2']>150 and 'load' in result['violations']
    assert evaluate(Inputs(load_limit=10),Configuration())['violations']==['load']


def test_finite_row_strip_matches_polygon_ray_projection():
    from backend.model import finite_shading
    from shapely.ops import unary_union
    tilt=30;alt=10;az=140;L=PANEL['length_m'];b=PANEL['width_m'];projected=L*np.cos(np.radians(tilt))
    rows=[{'y':3.,'count':1,'intervals':[[-b/2,b/2]]},{'y':0.,'count':3,'intervals':[[-1.5*b,-.5*b],[-.5*b,.5*b],[.5*b,1.5*b]]}]
    # Independently cast each upstream polygon onto the receiving inclined plane.
    sun=np.array([np.cos(np.radians(alt))*np.sin(np.radians(az-180)),np.cos(np.radians(alt))*np.cos(np.radians(az-180)),np.sin(np.radians(alt))])
    normal=np.array([0,np.tan(np.radians(tilt)),1.])
    target_constant=projected/2*np.tan(np.radians(tilt))
    projected_shadows=[]
    for left,right in rows[0]['intervals']:
        vertices=np.array([[left,3+projected/2,0],[right,3+projected/2,0],[right,3-projected/2,L*np.sin(np.radians(tilt))],[left,3-projected/2,L*np.sin(np.radians(tilt))]])
        projected_vertices=[]
        for vertex in vertices:
            distance=(normal@vertex-target_constant)/(normal@sun)
            projected_vertices.append((vertex-distance*sun)[:2])
        projected_shadows.append(Polygon(projected_vertices))
    target=unary_union([box(left,-projected/2,right,projected/2) for left,right in rows[1]['intervals']])
    expected=target.intersection(unary_union(projected_shadows)).area/target.area
    observed=finite_shading(np.array([alt]),np.array([az]),Configuration(tilt=tilt),rows)[1,0]
    assert expected>0
    assert observed==pytest.approx(expected,abs=1e-9)
    infinite=shading_fractions([alt],[az],tilt,180,rows)[1,0]
    assert observed<infinite


def test_exclusions_and_object_height_change_geometry_and_energy():
    from backend.model import Exclusion
    rect=Exclusion(x=3,y=.5,width=1,depth=1,height=0)
    low=Inputs(exclusions=[rect]);high=Inputs(exclusions=[rect.model_copy(update={'height':4})])
    conf=Configuration(rows=2)
    panels,*_=layout(low,conf)
    obstacle=box(3,.5,4,1.5)
    assert all(Polygon(p['corners']).intersection(obstacle).area<1e-8 for p in panels)
    a=evaluate(low,conf);b=evaluate(high,conf)
    assert a['panels_count']==b['panels_count']
    assert b['annual_kwh']<a['annual_kwh']


def test_martinez_mode_has_zero_unshaded_penalty_and_more_shading_loss():
    unshaded=Configuration(rows=1)
    a=evaluate(Inputs(),unshaded);b=evaluate(Inputs(electrical_model='martinez'),unshaded)
    assert a['annual_kwh']==b['annual_kwh']
    a=evaluate(Inputs(),Configuration());b=evaluate(Inputs(electrical_model='martinez'),Configuration())
    assert 0<b['annual_kwh']<a['annual_kwh']


@pytest.mark.parametrize('year,hours',[(2023,8760),(2024,8784),(2025,8760)])
def test_three_historical_weather_years(year,hours):
    w=weather(year)
    assert len(w['times'])==hours
    assert np.isfinite(w['temp']).all()
    assert len(set(w['times']))==hours
    r=evaluate(Inputs(weather_year=year),Configuration())
    assert r['annual_kwh']>0
    assert sum(r['monthly_kwh'])==pytest.approx(r['annual_kwh'],abs=.12)


def test_reference_pipeline_and_scenario_analysis_are_reproducible():
    from backend.reliability import analyse
    result=analyse(Inputs(),Configuration())
    assert len(result['scenarios'])==12
    assert len(result['weather_years'])==3
    assert len(result['ranking'])==8
    assert result['reference']['reference_kwh']>0
    assert len(result['reference']['monthly'])==12
    assert sum(r['reference_kwh'] for r in result['reference']['monthly'])==pytest.approx(result['reference']['reference_kwh'],abs=.12)
    assert result['range']['annual_kwh'][0] < result['base']['annual_kwh'] < result['range']['annual_kwh'][1]
    assert 'not a confidence interval' in result['scope']
    assert analyse(Inputs(),Configuration()) is result


def test_api_rejects_bad_new_fields_and_keeps_area_explicit():
    client=TestClient(app)
    for changes in [{'budget':-1},{'discount_rate':float('inf')},{'house_area':48,'width':10},
                    {'electrical_model':'magic'},{'exclusions':[{'x':7,'y':0,'width':2,'depth':1}]},
                    {'quote_date':'not-a-date'},{'weather_year':2022}]:
        if changes.get('discount_rate')==float('inf'):
            from pydantic import ValidationError
            with pytest.raises(ValidationError):Inputs(**changes)
        else:assert client.post('/api/evaluate',json={'inputs':changes}).status_code==422
    response=client.post('/api/evaluate',json={}).json()
    assert response['decision']['eligible']
    assert len(response['row_comparison'])==2
    metadata=client.get('/api/meta').json()
    assert len(metadata['weather_years'])==3
    assert len(metadata['weather_years']['2024']['csv_sha256'])==64


def test_tariff_boundaries_and_configured_cutoff():
    from copy import deepcopy
    from backend.finance import cashflows
    from backend.model import SETTINGS
    inputs=Inputs(commissioning='2033-12-01',annual_om=0,inverter_cost=0)
    assert finance(inputs,10,[100]*12)['fit_rate']==4
    assert finance(inputs,10.001,[100]*12)['fit_rate']==3
    assert finance(inputs,200,[100]*12)['fit_rate']==3
    assert finance(inputs,200.001,[100]*12)['fit_rate']==2.5
    settings=deepcopy(SETTINGS);settings['policy']['fit_end']='2032-12-31'
    r=cashflows(inputs,1,[100]*12,settings)
    assert r['net_A']==-r['initial_cost']


def test_leap_year_partial_month_cash_receipt():
    inputs=Inputs(commissioning='2028-02-29',price_per_kw=1000,fixed_cost=0,annual_om=0,inverter_cost=0)
    r=finance(inputs,1,[290]*12)
    # One day of February 2028: 290 kWh * 1/29 * HK$4 = HK$40.
    assert r['cashflow'][1]['date']=='2028-02-29'
    assert r['cashflow'][1]['A']==-960


def test_reference_case_without_a_module_returns_an_explicit_unavailable_result():
    from backend.reliability import reference_case
    r=reference_case(Inputs(width=1,depth=1),Configuration())
    assert r['available'] is False
    assert r['capacity_kw']==0 and r['difference_pct'] is None


@pytest.mark.parametrize('tilt',range(0,41,5))
def test_complete_boundary_rows_survive_all_slider_tilts(tilt):
    panels,rows,_,error=layout(Inputs(depth=7),Configuration(tilt=tilt,rows=2))
    assert error is None and len(panels)==12
    assert [r['count'] for r in rows]==[6,6]
    assert all(box(.5,.5,7.5,6.5).buffer(1e-8).covers(Polygon(p['corners'])) for p in panels)


def test_thirty_degree_default_retains_eighteen_modules():
    assert evaluate(Inputs(),Configuration(tilt=30))['panels_count']==18


def test_rotated_rows_search_translation_and_pitch_instead_of_roof_corners():
    inp=Inputs(depth=7)
    one=layout(inp,Configuration(azimuth=150,rows=1))[0]
    two=layout(inp,Configuration(azimuth=150,rows=2))[0]
    assert len(one)==6 and len(two)>=len(one)*1.5
    for i,p in enumerate(two):
        poly=Polygon(p['corners'])
        assert box(.5,.5,7.5,6.5).buffer(1e-8).covers(poly)
        assert all(poly.intersection(Polygon(q['corners'])).area<1e-8 for q in two[i+1:])


def test_partial_rows_target_nine_point_nine_kw_and_avoid_tariff_cliff():
    inp=Inputs(width=12,depth=10,house_area=200)
    a=evaluate(inp,Configuration(rows=3,panel_limit=22))
    b=evaluate(inp,Configuration(rows=3,panel_limit=23))
    assert a['panels_count']==22 and a['capacity_kw']==9.9 and a['fit_rate']==4
    assert b['panels_count']==23 and b['capacity_kw']==10.35 and b['fit_rate']==3
    assert a['npv_A']>b['npv_A']
    assert sum(r['count'] for r in a['rows'])==22
    assert {p['row'] for p in a['panels']}==set(range(len(a['rows'])))
    assert np.isfinite(a['annual_kwh'])


def test_financial_choices_really_optimise_the_selected_quantity():
    inp=Inputs(width=12,depth=10,house_area=200)
    searched=search(inp);eligible=[r for r in searched['configs'] if r['decision']['eligible']]
    choices=searched['recommendations']
    assert choices['npv']['npv_A']==max(r['npv_A'] for r in eligible)
    assert choices['under10']['npv_A']==max(r['npv_A'] for r in eligible if r['capacity_kw']<=10)
    assert choices['under10']['capacity_kw']==9.9
    assert choices['payback']['payback_years_A']==min(r['payback_years_A'] for r in eligible if r['payback_years_A'] is not None)
    assert all(r['capacity_kw']>=inp.minimum_capacity_kw for r in choices.values())


def test_quote_ceiling_is_all_in_and_solves_zero_npv_with_no_double_counted_costs():
    inp=Inputs();result=evaluate(inp,Configuration());capacity=result['capacity_kw']
    for key,post in [('A',False),('B',True)]:
        quote=result[f'max_acceptable_quote_{key}']
        at_quote=finance(inp.model_copy(update={'fixed_cost':0,'price_per_kw':quote/capacity,'post_fit':post}),capacity,result['monthly_kwh'])
        assert at_quote[f'npv_{key}']==pytest.approx(0,abs=.02)
        assert result[f'max_acceptable_per_kw_{key}']*capacity+inp.fixed_cost==pytest.approx(quote,abs=.1)
        stress=finance(inp.model_copy(update={'fixed_cost':0,'price_per_kw':result[f'max_acceptable_quote_stress_{key}']/capacity}),capacity,[v*.85 for v in result['monthly_kwh']])
        assert stress[f'npv_{key}']==pytest.approx(0,abs=.02)
        assert result[f'max_acceptable_quote_stress_{key}']<quote


def test_zero_modules_have_no_recovery_date_or_acceptable_quote():
    zero=evaluate(Inputs(width=1,depth=1),Configuration())
    for key in ['A','B']:
        assert zero[f'payback_{key}'] is None and zero[f'stable_payback_{key}'] is None
        assert zero[f'payback_years_{key}'] is None and zero[f'max_acceptable_quote_{key}'] is None
        assert zero[f'npv_{key}']==0


def test_independent_hko_same_year_check_does_not_silently_calibrate_weather():
    from backend.reference import irradiance_check
    before=weather()['ghi'].copy();check=irradiance_check()
    assert check['same_year']['hko_annual_kwh_m2']==pytest.approx(1510.36,abs=.02)
    assert check['same_year']['difference_pct']==pytest.approx(3,abs=.1)
    assert check['nasa_annual_kwh_m2']==pytest.approx(1555.59948,abs=.01)
    assert check['normals'][0]['annual_kwh_m2']<check['same_year']['hko_annual_kwh_m2']
    assert np.array_equal(before,weather()['ghi'])
    assert irradiance_check(2024)['same_year'] is None


def test_generation_record_requires_evidence_and_matching_calendar_period():
    client=TestClient(app)
    baseline=evaluate(Inputs(),Configuration())
    record={'start_month':1,'months':12,'generation_kwh':sum(baseline['monthly_kwh']),
            'installed_capacity_kw':baseline['capacity_kw'],'source':'Synthetic test fixture, not a field observation'}
    r=client.post('/api/reference-case',json={'measurement':record})
    assert r.status_code==200 and r.json()['difference_pct']==0
    assert 'not independently verified' in r.json()['scope'].lower()
    for change in [{'generation_kwh':0},{'source':''},{'start_month':12,'months':2},{'installed_capacity_kw':-1}]:
        assert client.post('/api/reference-case',json={'measurement':{**record,**change}}).status_code==422
    assert client.post('/api/reference-case',json={'inputs':{'width':1,'depth':1},'measurement':record}).status_code==422


def test_audit_complete_tilt_row_direction_grid_is_explicit_about_unbuildable_rows():
    inp=Inputs(depth=7)
    for tilt in range(0,41,5):
        for requested in range(1,5):
            south=evaluate(inp,Configuration(tilt=tilt,rows=requested))
            for az in [135,150,165,180,195,210,225]:
                r=evaluate(inp,Configuration(tilt=tilt,rows=requested,azimuth=az))
                assert r['requested_rows']==requested and r['actual_rows']==len(r['rows'])
                if 'rows_unbuildable' not in r['violations']:
                    assert r['actual_rows']==requested
                    if south['actual_rows']==requested:
                        assert all(row['count']>=.7*south['rows'][i]['count'] for i,row in enumerate(r['rows']))


def test_rounded_village_roof_does_not_silently_lose_a_row():
    r=evaluate(Inputs(width=8.06,depth=8.06,house_area=65),Configuration(tilt=25))
    assert r['actual_rows']==3 or 'rows_unbuildable' in r['violations']
    zero=evaluate(Inputs(width=1.5,depth=1.5),Configuration())
    assert zero['payback_A'] is None and zero['payback_years_A'] is None
    assert 'rows_unbuildable' in zero['violations']


def test_search_deduplicates_actual_geometry_not_requested_labels():
    candidates=search(Inputs())['configs']
    signatures=[]
    for r in candidates:
        _,rows,_,_=layout(Inputs(),Configuration(**r['config']))
        signatures.append((r['config']['tilt'],r['config']['azimuth'],r['actual_rows'],r['panels_count'],
                           tuple((round(row['y'],8),tuple(tuple(round(v,8) for v in interval) for interval in row['intervals'])) for row in rows)))
        assert r['actual_rows']==r['requested_rows']
    assert len(set(signatures))==len(signatures)
