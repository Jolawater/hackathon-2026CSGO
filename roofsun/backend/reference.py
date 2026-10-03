"""Independent HKO input checks and user-supplied generation-meter cases."""
import calendar
import json
import pandas as pd
from pydantic import BaseModel, Field
from .model import ROOT, Inputs, Configuration, evaluate


def irradiance_check(year=2025, scale=1):
    source=json.loads((ROOT/'data/hko_reference.json').read_text())
    df=pd.read_csv(ROOT/f'data/weather_{year}.csv')
    # Sum the original UTC calendar file, not the daylight-filtered model array.
    # Independent HKO values refer to King's Park local-calendar observations.
    nasa=float(df.ghi_wm2.sum()/1000)*scale
    data=source['observations'].get(str(year))
    current=None
    if data:
        hko=sum(value*calendar.monthrange(year,m+1)[1]/3.6 for m,value in enumerate(data['monthly_daily_mj_m2']))
        current={'year':year,'hko_annual_kwh_m2':round(hko,2),'difference_pct':round(100*(nasa/hko-1),2),
                 'source_url':data['source_url'],'monthly':[{'month':m+1,'hko_kwh_m2':round(value*calendar.monthrange(year,m+1)[1]/3.6,2)} for m,value in enumerate(data['monthly_daily_mj_m2'])]}
    normals=[{**n,'annual_kwh_m2':round(n['mean_daily_mj_m2']*365.2425/3.6,2),
              'difference_pct':round(100*(nasa/(n['mean_daily_mj_m2']*365.2425/3.6)-1),2)} for n in source['normals']]
    return {'nasa_annual_kwh_m2':round(nasa,2),'year':year,'weather_scale':scale,'same_year':current,
            'normals':normals,'station':"King's Park",'scope':source['scope'],
            'measured_pv_case_available':False}


class Measurement(BaseModel):
    start_month: int = Field(default=1,ge=1,le=12)
    months: int = Field(default=12,ge=1,le=12)
    generation_kwh: float = Field(gt=0,allow_inf_nan=False)
    installed_capacity_kw: float = Field(gt=0,le=1000,allow_inf_nan=False)
    source: str = Field(min_length=1,max_length=300)


def measured_case(inputs:Inputs,config:Configuration,measurement:Measurement):
    if measurement.start_month+measurement.months>13:
        raise ValueError('Use consecutive full calendar months within the selected weather year')
    result=evaluate(inputs,config)
    if not result['capacity_kw']:raise ValueError('A matching roof configuration with complete modules is required')
    selected=result['monthly_kwh'][measurement.start_month-1:measurement.start_month-1+measurement.months]
    # Normalise capacity explicitly; this is a comparison, never a hidden calibration.
    predicted=sum(selected)*measurement.installed_capacity_kw/result['capacity_kw']
    actual=measurement.generation_kwh
    return {'weather_year':inputs.weather_year,'measurement':measurement.model_dump(),
            'predicted_kwh':round(predicted,2),'difference_pct':round(100*(predicted/actual-1),2),
            'measured_specific_yield':round(actual/measurement.installed_capacity_kw,2),
            'modelled_specific_yield':round(sum(selected)/result['capacity_kw'],2),
            'scope':'User-supplied generation meter record for full calendar months. Model normalised to the stated installed capacity; roof geometry, shading, period and module assumptions must match. Consumption bills or payment amounts are not generation. Not independently verified and not a general accuracy claim.'}
