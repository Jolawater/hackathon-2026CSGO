"""Dated monthly cash flows with reusable schedules and vectorized finances."""
from functools import lru_cache
import numpy as np
import pandas as pd


@lru_cache(maxsize=128)
def schedule(commissioning, life_years, fit_end):
    start=pd.Timestamp(commissioning);end=start+pd.DateOffset(years=life_years)
    cutoff=pd.Timestamp(fit_end)+pd.Timedelta(days=1)
    records=[]
    for m in pd.date_range(start.replace(day=1),end.replace(day=1),freq='MS'):
        begin,stop=max(start,m),min(end,m+pd.offsets.MonthBegin(1))
        if stop<=begin:continue
        anniversary=start+pd.DateOffset(years=10)
        records.append((m.month-1,(stop-begin).days/m.days_in_month,
            max(0,(begin-start).days/365.2425),(stop-start).days/365.2425,
            max(0,(min(stop,cutoff)-begin).days)/(stop-begin).days,
            begin<=anniversary<stop,stop<=cutoff,
            (stop-pd.Timedelta(days=1)).strftime('%Y-%m-%d')))
    columns=list(zip(*records))
    return {'months':np.array(columns[0],int),'fractions':np.array(columns[1],float),'age':np.array(columns[2],float),
        'years':np.array(columns[3],float),'fit_fraction':np.array(columns[4],float),
        'replace':np.array(columns[5],bool),'before_cutoff':np.array(columns[6],bool),
        'dates':[start.strftime('%Y-%m-%d'),*columns[7]]}


def cashflows(inputs, capacity, monthly, settings):
    panel,policy=settings['panel'],settings['policy']
    fit=policy['fit_small'] if capacity<=10 else policy['fit_medium'] if capacity<=200 else policy['fit_large']
    cost=inputs.price_per_kw*capacity+inputs.fixed_cost if capacity else 0
    periods=schedule(inputs.commissioning.isoformat(),settings['finance']['life_years'],policy['fit_end'])
    energy=np.asarray(monthly)[periods['months']]*(1-panel['degradation'])**periods['age']*periods['fractions']
    spend=(inputs.annual_om/12*periods['fractions']*(1+inputs.cost_inflation)**periods['age']+
           inputs.inverter_cost*(1+inputs.cost_inflation)**10*periods['replace']) if capacity else np.zeros_like(energy)
    income=energy*fit*periods['fit_fraction']
    after=energy*(1-periods['fit_fraction'])*inputs.self_use_rate*inputs.self_use_share
    increments=[income-spend,income+after-spend]
    curves=[np.concatenate(([-cost],-cost+np.cumsum(flow))) for flow in increments]
    rounded=[np.round(c,2) for c in curves]
    flows=[{'date':stamp,'A':float(rounded[0][k]),'B':float(rounded[1][k])} for k,stamp in enumerate(periods['dates'])]
    before=np.flatnonzero(periods['before_cutoff'])
    net_fit=curves[0][before[-1]+1] if len(before) else -cost
    result={'initial_cost':round(cost,2),'fit_rate':fit,'net_to_fit_end':round(float(net_fit),2),'cashflow':flows}
    start=pd.Timestamp(inputs.commissioning)
    for j,name in enumerate(['A','B']):
        values=rounded[j]
        first=np.flatnonzero(values>=0)
        stable=np.flatnonzero(np.minimum.accumulate(values[::-1])[::-1]>=0)
        first_date=periods['dates'][first[0]] if capacity and len(first) else None
        stable_date=periods['dates'][stable[0]] if capacity and len(stable) else None
        discounted_operating=float(np.sum(increments[j]/(1+inputs.discount_rate)**periods['years']))
        # Quote includes installation only; all modelled O&M/replacement costs
        # are already deducted. Raw ceiling may be negative: no positive quote works.
        stress_flow=income*.85+(after*.85 if j else 0)-spend
        stress_ceiling=float(np.sum(stress_flow/(1+inputs.discount_rate)**periods['years']))
        result.update({f'max_acceptable_quote_{name}':round(discounted_operating,2) if capacity else None,
            f'max_acceptable_per_kw_{name}':round((discounted_operating-inputs.fixed_cost)/capacity,2) if capacity else None,
            f'max_acceptable_quote_stress_{name}':round(stress_ceiling,2) if capacity else None,
            f'max_acceptable_per_kw_stress_{name}':round((stress_ceiling-inputs.fixed_cost)/capacity,2) if capacity else None,
            f'quote_headroom_{name}':round(discounted_operating-cost,2) if capacity else None,
            f'net_{name}':round(float(curves[j][-1]),2),
            f'npv_{name}':round(float(-cost+np.sum(increments[j]/(1+inputs.discount_rate)**periods['years'])),2),
            f'payback_{name}':first_date,f'stable_payback_{name}':stable_date,
            f'payback_years_{name}':round((pd.Timestamp(stable_date)-start).days/365.2425,2) if stable_date else None})
    return result
