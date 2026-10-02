import math
import pytest
from fastapi.testclient import TestClient
from app import app
from engine import Scenario, Task, simulate, compare
from aging import AgingInput, aging
from catalog import catalog
from validation import run_validation


def test_validation():
    report=run_validation()
    assert report['all_passed'], report


@pytest.mark.parametrize('device',['phone','scooter','car'])
def test_presets_conserve_and_repeat(device):
    s=Scenario(**catalog()['presets'][device])
    s.days=3
    a=simulate(s)
    assert abs(a['metrics']['balance_error_wh'])<1e-6
    assert a==simulate(s)
    assert len(a['daily'])==3
    assert all(0<=x['soc']<=1 for x in a['trace'])


def test_empty_load_and_no_window():
    s=Scenario(tasks=[],window_start=0,window_end=0)
    a=simulate(s)['metrics']
    assert a['final_soc']==pytest.approx(s.initial_soc)
    assert a['grid_wh']==a['sessions']==a['energy_cycles']==0
    assert a['reserve_runtime_hours'] is None


def test_power_shortfall():
    s=Scenario(capacity_wh=10,initial_soc=.1,charge_w=1,window_start=0,window_end=23,tasks=[Task(start=0,end=24,power_w=10)])
    r=simulate(s)
    assert r['metrics']['unmet_wh']>200
    assert r['failures'][0]['hour']<1
    assert abs(r['metrics']['balance_error_wh'])<1e-7


def test_threshold_latch():
    s=Scenario(capacity_wh=100,initial_soc=.1,charge_w=10,efficiency=1,target=.8,trigger=.2,taper_soc=1,window_start=0,window_end=23,strategy='threshold')
    m=simulate(s)['metrics']
    assert m['final_soc']==pytest.approx(.8)
    assert m['sessions']==1
    assert m['charge_hours']==pytest.approx(7)


def test_departure_respects_earlier_window_end():
    s=Scenario(capacity_wh=100,initial_soc=.2,charge_w=20,efficiency=1,target=.8,
               taper_soc=1,window_start=0,window_end=7,departure=8,strategy='departure')
    m=simulate(s)['metrics']
    assert m['departure_soc']==pytest.approx(.8,abs=.004)
    assert m['charge_hours']==pytest.approx(3,abs=1/60)


def test_year_at_full_charge_preserves_energy():
    s=Scenario(**catalog()['presets']['scooter'])
    s.days=365
    result=simulate(s)
    assert abs(result['metrics']['balance_error_wh'])<1e-5
    assert len(result['daily'])==365
    assert result['trace'][-1]['hour']==8760


def test_random_seed_and_winter():
    s=Scenario(**catalog()['presets']['car'])
    s.fluctuation=.2
    assert simulate(s)==simulate(s)
    cold=s.model_copy(update={'cold_capacity_factor':.9,'heating_w':1000})
    assert simulate(cold)['metrics']['delivered_wh']>simulate(s)['metrics']['delivered_wh']
    assert cold.soh==s.soh


def test_pareto_never_infeasible():
    c=compare(Scenario(**catalog()['presets']['phone']))
    assert all(x['metrics']['feasible'] for x in c['candidates'] if x['pareto'])
    if c['recommended']:
        assert next(x for x in c['candidates'] if x['id']==c['recommended'])['metrics']['feasible']


@pytest.mark.parametrize('params,reason',[
    ({'temperature_c':0},'temperature_range'),
    ({'lower_soc':.2,'upper_soc':.8},'depth_range'),
    ({'charge_c':2},'rate_range'),
    ({'temperature_c':10,'charge_c':1},'cold_charge'),
    ({'profile':[[0,.9],[12,.1],[24,.8]]},'open_cycle'),
    ({'profile':[[0,.9],[4,.1],[8,.9],[12,.7],[16,.9],[24,.9]]},'depth_range'),
])
def test_evidence_gate(params,reason):
    a=aging(AgingInput(days=2,**params))
    assert a['soh'] is None and a['curve']==[]
    assert reason in a['reasons']


def test_supported_aging_decreases():
    a=aging(AgingInput(days=30))
    assert a['status']=='supported'
    assert 0<a['soh']<1
    assert all(x['soh']>=y['soh'] for x,y in zip(a['curve'],a['curve'][1:]))
    assert a['curve'][-1]['calendar_loss']>0
    assert a['curve'][-1]['cycle_loss']>0


def test_constant_energy_boundary():
    a=aging(AgingInput(days=365,lower_soc=0,upper_soc=1,constant_energy=True))
    assert a['status']=='stopped_at_boundary'
    assert len(a['curve'])==2


def test_api_validation_and_roundtrip():
    with TestClient(app) as c:
        assert c.get('/').status_code==200
        presets=c.get('/api/catalog').json()['presets']
        response=c.post('/api/simulate',json=presets['phone'])
        assert response.status_code==200
        assert c.post('/api/simulate',json=response.json()['input']).json()==response.json()
        bad={**presets['phone'],'trigger':.95,'target':.8}
        assert c.post('/api/simulate',json=bad).status_code==422
        assert c.post('/api/aging',json={'profile':[[0,.8],[0,.2],[24,.8]]}).status_code==422
        assert c.get('/api/validation').json()['all_passed']
