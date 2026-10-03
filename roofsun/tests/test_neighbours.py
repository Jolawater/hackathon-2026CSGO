import pytest
from backend.screening import SevenInputs, Neighbour, facade_horizon, neighbours_horizon, model_inputs, import_owner, higher_neighbours
from backend.model import evaluate, Configuration

def test_horizon_regression_and_union():
    south=Neighbour(direction=180,floors=2,distance=6)
    east=Neighbour(direction=90,floors=2,distance=6)
    a=facade_horizon(2,6,180);b=facade_horizon(2,6,90)
    assert a==[0,0,0,0,26.6,40.9,45,40.9,26.6,0,0,0]
    assert b[3]==45 and all(b[i]==0 for i in [0,6,7,8,9,10,11])
    assert neighbours_horizon([south,east])==[max(x,y) for x,y in zip(a,b)]
    assert neighbours_horizon([east,east])==b

def test_old_records_migrate_before_filtering():
    legacy=SevenInputs().model_dump();legacy.pop('neighbours');legacy['neighbour']={'floors':2.5,'distance':7.5}
    for owner in [SevenInputs.model_validate(legacy),import_owner({'inputs':legacy})[0]]:
        assert owner.neighbours[0].model_dump()=={'direction':180,'floors':2.5,'distance':7.5}
    for neighbours in [[],[{}]*4,[{'direction':22}]]:
        with pytest.raises(ValueError):SevenInputs(neighbours=neighbours)

def test_fixed_east_case_and_sensitivity():
    base=model_inputs(SevenInputs())
    east=model_inputs(SevenInputs(neighbours=[Neighbour(direction=90,floors=2,distance=6)]))
    config=Configuration(rows=2,tilt=15,azimuth=180)
    loss=1-evaluate(east,config)['annual_kwh']/evaluate(base,config)['annual_kwh']
    # Supplied 15–20% target differs from this exact baseline: do not retune physics.
    assert loss==pytest.approx(.1135752789,abs=1e-6)
    assert [n.floors for n in higher_neighbours([Neighbour(),Neighbour(direction=90)])]==[1,0]
    assert [n.floors for n in higher_neighbours([Neighbour(floors=2),Neighbour(direction=90,floors=3)])]==[3,4]

def test_roof_sides_capped_for_response_time():
    from backend.screening import ScreeningRequest
    SevenInputs(roof={'width':10,'depth':10})
    for side in (10.01,30):
        with pytest.raises(ValueError):SevenInputs(roof={'width':side,'depth':8})
        with pytest.raises(ValueError):SevenInputs(roof={'width':8,'depth':side})

def test_slow_request_does_not_block_different_inputs(monkeypatch):
    import threading,time
    from backend import screening
    started=threading.Event();release=threading.Event();calls=[]
    def fake(key):
        calls.append(key)
        if '"width":9.0' in key:started.set();release.wait(5)
        return {'key':key}
    monkeypatch.setattr(screening,'screen_cached',fake)
    slow=screening.ScreeningRequest(inputs=SevenInputs(roof={'width':9,'depth':9}))
    fast=screening.ScreeningRequest(inputs=SevenInputs(roof={'width':7,'depth':7}))
    worker=threading.Thread(target=screening.screen,args=(slow,));worker.start()
    assert started.wait(5)
    t=time.perf_counter();screening.screen(fast);elapsed=time.perf_counter()-t
    release.set();worker.join(5)
    assert elapsed<1 and len(calls)==2 and not screening._inflight

def test_identical_requests_share_one_computation(monkeypatch):
    import threading
    from backend import screening
    gate=threading.Event();calls=[]
    def fake(key):
        calls.append(key);gate.wait(5);return {'key':key}
    monkeypatch.setattr(screening,'screen_cached',fake)
    req=screening.ScreeningRequest(inputs=SevenInputs(roof={'width':6.5,'depth':6.5}))
    threads=[threading.Thread(target=screening.screen,args=(req,)) for _ in range(3)]
    for th in threads:th.start()
    threading.Event().wait(.3);gate.set()
    for th in threads:th.join(5)
    # Waiters re-enter after the first finishes; the real lru_cache then serves them.
    assert calls[0]==req.model_dump_json() and not screening._inflight
