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
    allowed=box(.5,.5,inputs.width-.5,inputs.depth-.5).buffer(1e-7)
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
    inputs=Inputs(width=8,depth=6,house_area=48,minimum_access_gap_m=0)
    result=evaluate(inputs,Configuration(tilt=20,rows=3,layout_mode="spread"))
    assert 'coverage' in result['violations']
    assert all(r['coverage_m2']<=24.01 for r in search(inputs)['configs'])


def test_night_and_front_row_shadows():
    sun=sun_preview(Inputs(width=8,depth=6,house_area=80,minimum_access_gap_m=0),Configuration(tilt=20,rows=3,layout_mode="spread"),pd.Timestamp('2025-12-21').date(),0)
    assert sun['altitude']<0 and not sun['beam_clear']
    day=sun_preview(Inputs(width=8,depth=6,house_area=80,minimum_access_gap_m=0),Configuration(tilt=20,rows=3,layout_mode="spread"),pd.Timestamp('2025-12-21').date(),12)
    assert day['row_shade'][0]==0 and day['row_shade'][1]>0


def test_financial_cutoff_and_replacement():
    inputs=Inputs(commissioning='2033-12-01',price_per_kw=10000,fixed_cost=0,annual_om=0,inverter_cost=500)
    result=finance(inputs,1,[100]*12)
    # Only the December 2033 interval earns FiT. Replacement is a single cash-flow jump.
    assert result['cashflow'][1]['A']==pytest.approx(-9600)
    assert result['net_A']==pytest.approx(-9600)
    assert result['net_B']>result['net_A']
    assert result['payback_A'] is None
    assert finance(inputs.model_copy(update={'self_use_share':0}),1,[100]*12)['net_B']==pytest.approx(result['net_A']-inputs.inverter_cost)


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
    for inputs in [Inputs(budget=1000), Inputs(commissioning='2032-01-01',require_profit=True,max_payback_years=7)]:
        result=search(inputs)
        assert result['configs']
        assert result['eligible_count']==0
        assert result['recommendations']=={}
        assert result['verdict']=='defer_installation'
        assert result['no_install']['initial_cost']==0
        assert result['no_install']['npv_A']==0


def test_optional_financial_goals_and_budget_remain_distinct():
    inputs=Inputs(commissioning='2032-01-01',require_profit=False,max_payback_years=0,budget=80000)
    result=search(inputs)
    assert result['recommendations']
    assert all(r['initial_cost']<=80000 for r in result['recommendations'].values())
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
    inputs=Inputs(commissioning='2033-12-01',price_per_kw=2000,fixed_cost=0,annual_om=0,inverter_cost=5000,self_use_share=0)
    r=finance(inputs,1,[1000]*12)
    assert r['payback_A']=='2033-12-31'
    assert r['stable_payback_A']=='2033-12-31'
    assert r['net_A']==2000
    assert r['stable_payback_B'] is None and r['net_B']==-3000


def test_tariff_cliff_can_make_more_generation_less_profitable():
    inputs=Inputs(width=10,depth=8,house_area=150)
    a=evaluate(inputs,Configuration(rows=3,tilt=40));b=evaluate(inputs,Configuration(rows=4,tilt=40))
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
    a=evaluate(Inputs(electrical_model='linear'),unshaded);b=evaluate(Inputs(electrical_model='martinez'),unshaded)
    assert a['annual_kwh']==b['annual_kwh']
    a=evaluate(Inputs(electrical_model='linear'),Configuration());b=evaluate(Inputs(electrical_model='martinez'),Configuration())
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
    panels,rows,_,error=layout(Inputs(width=8,depth=7),Configuration(tilt=tilt,rows=2))
    assert error is None and len(panels)==12
    assert [r['count'] for r in rows]==[6,6]
    assert all(box(.5,.5,7.5,6.5).buffer(1e-8).covers(Polygon(p['corners'])) for p in panels)


def test_historical_thirty_degree_layout_retains_eighteen_modules_without_access_gap():
    assert evaluate(Inputs(width=8,depth=6,house_area=80,minimum_access_gap_m=0),Configuration(tilt=30,rows=3,layout_mode="spread"))['panels_count']==18


def test_rotated_rows_search_translation_and_pitch_instead_of_roof_corners():
    inp=Inputs(width=8,depth=7)
    one=layout(inp,Configuration(tilt=20,azimuth=150,rows=1))[0]
    two=layout(inp,Configuration(tilt=20,azimuth=150,rows=2))[0]
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
    inp=Inputs(width=8,depth=7)
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
    r=evaluate(Inputs(width=8.06,depth=8.06,house_area=65),Configuration(tilt=25,rows=3))
    assert r['actual_rows']==3 or 'rows_unbuildable' in r['violations']
    zero=evaluate(Inputs(width=1.5,depth=1.5),Configuration())
    assert zero['payback_A'] is None and zero['payback_years_A'] is None
    assert 'rows_unbuildable' in zero['violations']
    response=TestClient(app).post('/api/evaluate',json={'inputs':{'width':1.5,'depth':1.5}})
    assert response.status_code==200
    for scenario in ['A','B']:
        assert response.json()[f'payback_{scenario}'] is None
        assert response.json()[f'payback_years_{scenario}'] is None
        assert response.json()[f'stable_payback_{scenario}'] is None


def test_search_deduplicates_actual_geometry_not_requested_labels():
    candidates=search(Inputs())['configs']
    signatures=[]
    for r in candidates:
        _,rows,_,_=layout(Inputs(),Configuration(**r['config']))
        signatures.append((r['config']['tilt'],r['config']['azimuth'],r['actual_rows'],r['panels_count'],
                           tuple((round(row['y'],8),tuple(tuple(round(v,8) for v in interval) for interval in row['intervals'])) for row in rows)))
        assert r['actual_rows']==r['requested_rows']
    assert len(set(signatures))==len(signatures)


def test_compact_village_layout_fits_eighteen_modules_and_real_access_gap():
    inp=Inputs(width=8.06,depth=8.06,house_area=65)
    compact=evaluate(inp,Configuration(tilt=40,rows=3,layout_mode='compact'))
    spread=evaluate(inp,Configuration(tilt=40,rows=3,layout_mode='spread'))
    assert compact['compliant'] and compact['actual_rows']==3
    assert compact['panels_count']==18 and compact['capacity_kw']==8.1
    assert compact['coverage_m2']<=32.5 and compact['minimum_clear_gap_m']>=.3-1e-4
    assert 'coverage' in spread['violations']
    assert compact['specific_yield']<spread['specific_yield']
    # 35 degrees cannot meet both 0.3 m access and this coverage limit.
    thirty_five=evaluate(inp,Configuration(tilt=35,rows=3,layout_mode='compact'))
    assert 'coverage' in thirty_five['violations']
    assert evaluate(inp.model_copy(update={'minimum_access_gap_m':.2}),Configuration(tilt=35,rows=3,layout_mode='compact'))['compliant']


def test_physical_and_financial_tradeoffs_are_supported_without_forcing_distinct_choices():
    inp=Inputs(width=8.06,depth=8.06,house_area=65,price_per_kw=14000)
    # Quote is a deliberately labelled synthetic test assumption, not a market price.
    searched=search(inp)
    fast=searched['recommendations']['payback'];value=searched['recommendations']['npv']
    assert fast['config']!=value['config']
    assert fast['payback_years_A']<value['payback_years_A'] and fast['npv_A']<value['npv_A']
    two=evaluate(inp,Configuration(tilt=40,rows=2,layout_mode='compact'))
    three=evaluate(inp,Configuration(tilt=40,rows=3,layout_mode='compact'))
    assert three['annual_kwh']>two['annual_kwh'] and three['specific_yield']<two['specific_yield']


def test_search_contains_both_layout_strategies_and_gap_invalidates_physical_cache():
    from backend.decision import physical_search
    inp=Inputs(width=8.06,depth=8.06,house_area=65)
    result=search(inp)
    assert {r['config']['layout_mode'] for r in result['configs']}=={'spread','compact'}
    misses=physical_search.cache_info().misses
    search(inp.model_copy(update={'minimum_access_gap_m':.35}))
    assert physical_search.cache_info().misses>misses
    assert TestClient(app).post('/api/evaluate',json={'inputs':{'minimum_access_gap_m':-.1}}).status_code==422


def test_village_presets_have_supported_dimensions_obstacles_and_distinct_decisions():
    import json
    from backend.model import ROOT, POLICY
    document=json.loads((ROOT/'data/roof_presets.json').read_text())
    assert POLICY['village_house_area_limit_m2']==65.03
    assert 'landsd.gov.hk' in document['source_url'] and 'printed page 3' in document['source_section']
    choices={}
    for preset in document['presets']:
        inp=Inputs(**preset['inputs']);cfg=Configuration(**preset['config'])
        assert inp.house_area<=65.03 and abs(inp.width*inp.depth-inp.house_area)<.1
        assert inp.exclusions and inp.village_house_mode
        r=evaluate(inp,cfg)
        assert r['compliant'] and r['actual_rows']==cfg.rows
        choices[preset['id']]=search(inp)
    assert choices['open']['recommendations']
    assert choices['shaded']['verdict']!=choices['open']['verdict'] or choices['shaded']['recommendations']['npv']['config']!=choices['open']['recommendations']['npv']['config']


def test_village_size_scope_is_a_warning_not_a_silent_legal_approval_or_api_error():
    client=TestClient(app)
    r=client.post('/api/evaluate',json={'inputs':{'width':8,'depth':8,'house_area':70,'village_house_mode':True}})
    assert r.status_code==200 and 'village_house_area' in r.json()['warnings']
    assert 'village_house_area' not in r.json()['violations']
    generic=client.post('/api/evaluate',json={'inputs':{'width':8,'depth':8,'house_area':70,'village_house_mode':False}})
    assert generic.status_code==200 and generic.json()['warnings']==[]
    assert Inputs(width=6,depth=5.4,house_area=32.4).house_area==32.4
    # Scope warnings are recomputed from current inputs, even on a geometry cache hit.
    inp=Inputs(width=8,depth=8,house_area=70)
    village=search(inp)
    generic=search(inp.model_copy(update={'village_house_mode':False}))
    assert generic['physical_cache_hit'] and generic['configs']
    assert all('village_house_area' in r['warnings'] for r in village['configs'])
    assert all(r['warnings']==[] for r in generic['configs'])


def test_rotated_obstacle_packing_remains_disjoint_after_search_optimisation():
    # Independent Shapely intersection checks across oblique module footprints.
    from backend.model import Exclusion
    obstacles=[Exclusion(x=2,y=2,width=1.2,depth=1.5),Exclusion(x=6,y=5.7,width=.8,depth=1.2)]
    inp=Inputs(exclusions=obstacles)
    for az in [135,150,165,180,195,210,225]:
        for tilt in [0,25,40]:
            panels,_,_,_=layout(inp,Configuration(tilt=tilt,azimuth=az,rows=2))
            assert panels
            for panel in panels:
                for obj in obstacles:
                    assert Polygon(panel['corners']).intersection(box(obj.x,obj.y,obj.x+obj.width,obj.y+obj.depth)).area<1e-7


# v3 owner workflow: equations stay covered above; these verify the new adapter.
def test_v3_defaults_use_generated_observations_and_fixed_assumptions():
    from backend.calibration import weather_ratio
    from backend.screening import SevenInputs, model_inputs
    inp=model_inputs(SevenInputs())
    assert Inputs().weather_scale==weather_ratio(2025)==inp.weather_scale
    assert Inputs().electrical_model==inp.electrical_model=='martinez'
    assert inp.bypass_blocks==3 and inp.finite_rows is True
    assert inp.discount_rate==.04 and inp.cost_inflation==0
    assert inp.minimum_capacity_kw==2 and inp.minimum_access_gap_m==.3
    assert inp.minimum_row_fill_ratio==.7 and inp.load_limit==150
    assert inp.extra_mass_per_module==0 and not inp.post_fit
    assert inp.budget==inp.max_payback_years==0 and not inp.require_profit
    assert inp.self_use_share==.5 and inp.self_use_rate==1.4


def test_hko_source_ratios_are_reproducible_without_a_literal_correction():
    import json
    from backend.model import ROOT
    from backend.calibration import calibration,weather_ratio
    from scripts.hko_check import calculate
    regenerated=calculate()
    assert regenerated==json.loads((ROOT/'data/hko_check.json').read_text())==calibration()
    for record in regenerated['years']:
        assert .9<record['ratio']<1
        assert record['ratio']==record['hko_kwh_m2']/record['nasa_kwh_m2']
        assert weather_ratio(record['year'])==record['ratio']
        assert record['days']==(366 if record['year']==2024 else 365)
    assert regenerated['combined_ratio']==sum(r['hko_kwh_m2'] for r in regenerated['years'])/sum(r['nasa_kwh_m2'] for r in regenerated['years'])
    assert weather_ratio(2025)==pytest.approx(.971,abs=.0005)  # Rounded plan value, not a runtime constant.
    assert [len(r['flagged_days']) for r in regenerated['years']]==[2,0,4]
    assert 'not measured PV accuracy' in regenerated['scope']


@pytest.mark.parametrize('bad_value',['nan','inf','-1','***'])
def test_calibration_rejects_missing_or_invalid_daily_observations(tmp_path,bad_value):
    from scripts.hko_check import calculate
    (tmp_path/'data').mkdir()
    (tmp_path/'data/hko_kp_daily_gsr.csv').write_text(f'2025,1,1,{bad_value},C\n')
    with pytest.raises(ValueError):calculate(tmp_path)


@pytest.mark.parametrize('band,expected',[
    ('low',(2000,0,4000)),('medium',(5000,300,5000)),('high',(10000,1000,10000))])
def test_all_seven_owner_answers_map_to_model_inputs(band,expected):
    from backend.screening import SevenInputs,model_inputs
    from datetime import date
    owner=SevenInputs(roof={'width':7,'depth':8},door_direction=225,
        neighbour={'floors':2,'distance':6},price_per_kw=27000,cost_band=band,
        commissioning_month='2028-09',post_fit=True)
    inp=model_inputs(owner)
    assert len(owner.model_dump())==7
    assert (inp.width,inp.depth,inp.house_area)==(7,8,56)
    assert inp.exclusions==[] and inp.roof_rotation==225
    # Known geometry: height=6 m and distance=6 m -> southern elevation=45°.
    assert inp.horizon==[0,0,0,0,26.6,40.9,45.,40.9,26.6,0,0,0]
    assert inp.price_per_kw==27000
    assert (inp.fixed_cost,inp.annual_om,inp.inverter_cost)==expected
    assert inp.commissioning==date(2028,9,1) and inp.post_fit


@pytest.mark.parametrize('direction',range(0,360,45))
def test_eight_door_directions_preserve_rotation(direction):
    from backend.screening import SevenInputs,model_inputs
    assert model_inputs(SevenInputs(door_direction=direction)).roof_rotation==direction


def test_three_point_verdict_boundaries_are_explicit():
    from backend.screening import classify
    for values,expected in [([1,2,3],'worthwhile'),([-1,0,2],'marginal'),([0,1,2],'marginal'),([-2,-1,0],'not_recommended')]:
        assert classify([{'npv':v} for v in values])==expected


@pytest.mark.parametrize('post_fit',[False,True])
def test_three_point_npv_uses_one_configuration_and_the_selected_income_case(post_fit):
    from backend.screening import SevenInputs,ScreeningRequest,model_inputs,screen
    from backend.calibration import calibration,weather_ratio
    owner=SevenInputs(post_fit=post_fit);inp=model_inputs(owner)
    result=screen(ScreeningRequest(inputs=owner))
    cfg=Configuration(**result['result']['config'])
    scales=[calibration()['combined_ratio'],weather_ratio(2025),1]
    rates=[.08,.04,0]
    for point,scale,rate in zip(result['interval']['points'],scales,rates):
        direct=evaluate(inp.model_copy(update={'weather_scale':scale,'discount_rate':rate}),cfg,False)
        assert point['weather_scale']==scale and point['discount_rate']==rate
        assert point['npv']==direct['npv_B' if post_fit else 'npv_A']
    candidate_npvs=[r['npv_B' if post_fit else 'npv_A'] for r in search(inp)['configs'] if r['capacity_kw']>=2]
    assert result['recommended']['npv']==max(candidate_npvs)
    assert result['result']['payback_date']==result['result']['stable_payback_B' if post_fit else 'stable_payback_A']
    assert result['interval']['points'][1]['npv']==result['result']['npv']
    assert result['result']['quote_ceiling_per_kw']==result['result']['max_acceptable_per_kw_B' if post_fit else 'max_acceptable_per_kw_A']


def test_owner_adjacent_rows_are_feasible_and_show_a_real_generation_tradeoff():
    from backend.screening import ScreeningRequest,screen
    base=screen(ScreeningRequest());more=screen(ScreeningRequest(selected_rows=base['alternatives']['more']))
    assert more['result']['actual_rows']==base['result']['actual_rows']+1
    assert more['result']['compliant'] and base['result']['compliant']
    assert more['result']['annual_kwh']>base['result']['annual_kwh']
    assert more['result']['specific_yield']<base['result']['specific_yield']
    trade=base['tradeoff'];a,b=trade['from'],trade['to']
    assert trade['extra_kwh']==pytest.approx(b['annual_kwh']-a['annual_kwh'])
    assert trade['extra_cost']==b['initial_cost']-a['initial_cost']
    assert b['payback_years']>a['payback_years'] and trade['payback_months']>0
    assert more['recommended_interval']==base['interval']
    assert not more['is_recommended']
    assert len(base['sun_path'])==25 and base['sun_path'][12]['hour']==12
    noon=sun_preview(Inputs(**base['mapped_inputs']),Configuration(**base['result']['config']),pd.Timestamp('2025-12-21').date(),12)
    assert base['sun_path'][12]['altitude']==noon['altitude']


def test_owner_sensitivity_has_nine_recalculated_cases_and_no_fabricated_field_record():
    from backend.screening import ScreeningRequest,analyse_seven,model_inputs,SevenInputs
    from backend.calibration import weather_ratio
    report=analyse_seven(ScreeningRequest())
    by_id={r['id']:r for r in report['scenarios']}
    assert len(by_id)==9 and report['field_case']=={'available':False,'status':'pending'}
    inp=model_inputs(SevenInputs());config=Configuration(**report['configuration'])
    assert by_id['quote_minus_20']['npv']>by_id['quote_plus_20']['npv']
    assert by_id['delay_6_months']['npv']>by_id['delay_12_months']['npv']
    for year in (2023,2024):
        revised=inp.model_copy(update={'weather_year':year,'weather_scale':weather_ratio(year)})
        expected=evaluate(revised,config,False)
        case=by_id[f'weather_{year}']
        assert case['npv']==expected['npv_A'] and case['annual_kwh']==expected['annual_kwh']
    assert by_id['quote_plus_20']['npv']==evaluate(inp.model_copy(update={'price_per_kw':inp.price_per_kw*1.2}),config,False)['npv_A']
    assert all(isinstance(r['recommendation_changed'],bool) for r in by_id.values())


def test_seven_input_api_rejects_deleted_overrides_and_handles_no_or_negative_value_systems():
    from backend.screening import SevenInputs
    client=TestClient(app)
    owner=SevenInputs().model_dump()
    for change in [{'electrical_model':'linear'},{'door_direction':22},{'commissioning_month':'2027-13'},
                   {'cost_band':'unknown'},{'neighbour':{'floors':-1,'distance':1}},{'roof':{'width':0,'depth':8}}]:
        assert client.post('/api/screen',json={'inputs':{**owner,**change}}).status_code==422
    tiny=client.post('/api/screen',json={'inputs':{**owner,'roof':{'width':1,'depth':1}}}).json()
    assert tiny['result'] is None and tiny['verdict']=='not_recommended' and tiny['sun_path']==[]
    late=client.post('/api/screen',json={'inputs':{**owner,'commissioning_month':'2032-01'}}).json()
    assert late['result']['compliant'] and late['verdict']=='not_recommended'
    assert late['result']['payback_date'] is None
    assert late['interval']['max']<0


def test_old_archives_discard_deleted_assumptions_and_results_before_recalculation():
    from backend.screening import SevenInputs,model_inputs
    client=TestClient(app)
    old={'model_version':'2.2.0','plans':[{'inputs':{'width':8,'depth':7,'house_area':150,
        'roof_rotation':143,'commissioning':'2028-06-15','price_per_kw':21000,
        'fixed_cost':2000,'annual_om':0,'inverter_cost':4000,'post_fit':True,
        'horizon':[80]*12,'weather_scale':1.5,'discount_rate':0,'extra_mass_per_module':400,
        'exclusions':[{'x':2,'y':2,'width':1,'depth':1}], 'electrical_model':'linear'},
        'config':{'tilt':0,'rows':20},'annual_kwh':99999999}]}
    response=client.post('/api/import-owner',json=old)
    assert response.status_code==200
    record=response.json();assert record['migrated'] and record['neighbour_reset']
    assert set(record['inputs'])==set(SevenInputs.model_fields)
    inp=model_inputs(SevenInputs(**record['inputs']))
    assert inp.house_area==56 and inp.roof_rotation==135 and inp.exclusions==[]
    assert inp.horizon==[0]*12 and inp.electrical_model=='martinez' and inp.discount_rate==.04
    assert inp.extra_mass_per_module==0 and inp.price_per_kw==21000 and inp.fixed_cost==2000
    assert inp.commissioning.isoformat()=='2028-06-01' and inp.post_fit
    for payload in [{'plans':['invalid']},{'plans':{'bad':1}},{'inputs':{'width':-1}},{}]:
        assert client.post('/api/import-owner',json=payload).status_code==422
    new={'inputs':{**SevenInputs().model_dump(),'weather_scale':1.5},'result':{'npv':9999999}}
    valid=client.post('/api/import-owner',json=new).json()
    assert not valid['migrated'] and 'weather_scale' not in valid['inputs']


def test_analyse_validates_owner_shape_before_legacy_fallback():
    from backend.screening import SevenInputs
    client=TestClient(app)
    for change in [{'roof':{'width':-1,'depth':8}},{'cost_band':'invalid'},{'weather_scale':2}]:
        response=client.post('/api/analyse',json={'inputs':{**SevenInputs().model_dump(),**change}})
        assert response.status_code==422
    assert client.post('/api/analyse',json={'inputs':SevenInputs().model_dump()}).json()['field_case']['available'] is False


def test_conservative_shutdown_stops_all_costs_while_self_use_remains_unchanged():
    from backend.finance import schedule
    from backend.model import SETTINGS
    inp=Inputs()
    result=finance(inp,5.4,[500]*12)
    periods=schedule(inp.commissioning.isoformat(),25,SETTINGS['policy']['fit_end'])
    energy=np.array([500]*12)[periods['months']]*(1-SETTINGS['panel']['degradation'])**periods['age']*periods['fractions']
    spend=inp.annual_om/12*periods['fractions']*(1+inp.cost_inflation)**periods['age']+inp.inverter_cost*(1+inp.cost_inflation)**10*periods['replace']
    increments_B=energy*result['fit_rate']*periods['fit_fraction']+energy*(1-periods['fit_fraction'])*inp.self_use_rate*inp.self_use_share-spend
    original_B=np.concatenate(([-result['initial_cost']],-result['initial_cost']+np.cumsum(increments_B)))
    assert np.array([r['B'] for r in result['cashflow']])==pytest.approx(np.round(original_B,2),abs=.001)
    after=[r['A'] for r in result['cashflow'] if r['date']>='2033-12-31']
    assert len(set(after))==1
    january=next(i for i,r in enumerate(result['cashflow']) if r['date']=='2037-01-31')
    assert result['cashflow'][january]['A']==result['cashflow'][january-1]['A']
    assert result['cashflow'][january]['B']<result['cashflow'][january-1]['B']-4000
    assert result['net_A']==result['net_to_fit_end']


def test_default_shutdown_npv_quote_and_three_point_verdict():
    from backend.screening import screen,ScreeningRequest
    result=screen(ScreeningRequest())
    assert result['result']['npv_A']==pytest.approx(18299,abs=2)
    assert result['result']['quote_ceiling_per_kw']==pytest.approx(28389,abs=2)
    assert result['verdict']=='marginal'
    assert result['interval']['points'][0]['npv']==pytest.approx(-3373,abs=2)


def test_shutdown_prorates_maintenance_and_does_not_replace_after_partial_month_cutoff():
    from copy import deepcopy
    from backend.model import SETTINGS
    from backend.finance import cashflows
    settings=deepcopy(SETTINGS);settings['policy']['fit_end']='2033-12-15'
    inp=Inputs(annual_om=372,inverter_cost=5000).model_copy(update={'commissioning':pd.Timestamp('2023-12-20').date()})
    r=cashflows(inp,1,[100]*12,settings)
    december=next(i for i,p in enumerate(r['cashflow']) if p['date']=='2033-12-31')
    # Ten-year replacement is Dec 20, after shutdown on Dec 15.
    assert r['cashflow'][december]['B']<r['cashflow'][december-1]['B']-4500
    expected_income=100*(1-.005)**((pd.Timestamp('2033-12-01')-pd.Timestamp('2023-12-20')).days/365.2425)*4*15/31
    assert r['cashflow'][december]['A']-r['cashflow'][december-1]['A']==pytest.approx(expected_income-15,abs=.02)
    assert r['cashflow'][december+1]['A']==r['cashflow'][december]['A']


def test_monthly_hko_sums_and_seasonal_correlation_are_computed_from_observations():
    from scripts.hko_check import calculate,compare_monthly
    from backend.screening import screen,ScreeningRequest
    report=calculate()
    for year in report['years']:
        assert len(year['monthly_kwh_m2'])==12
        assert sum(year['monthly_kwh_m2'])==pytest.approx(year['hko_kwh_m2'])
    result=screen(ScreeningRequest())
    comparison=compare_monthly(result['result']['monthly_kwh'],2025,report)
    assert comparison==result['monthly_comparison']
    assert comparison['pearson_r']==pytest.approx(np.corrcoef(result['result']['monthly_kwh'],report['years'][2]['monthly_kwh_m2'])[0,1])
    assert .95<comparison['pearson_r']<.98
    assert compare_monthly([0]*12,2025,report)['pearson_r'] is None
    with pytest.raises(ValueError):compare_monthly([1]*11,2025,report)
    more=screen(ScreeningRequest(selected_rows=3))
    assert more['monthly_comparison']['months'][0]['model_kwh']==more['result']['monthly_kwh'][0]
    assert more['monthly_comparison']['months']!=comparison['months']
