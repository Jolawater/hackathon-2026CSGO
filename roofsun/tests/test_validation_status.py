from backend.validation_status import fingerprints, report_status


def test_saved_report_cannot_validate_changed_model_or_weather(tmp_path):
    (tmp_path/'backend').mkdir()
    (tmp_path/'data').mkdir()
    model=tmp_path/'backend/model.py'
    model.write_text('version=1')
    weather=tmp_path/'data/weather_2025.csv'
    weather.write_text('ghi\n100')
    report={'model_version':'2.1.0','generated_at':'2026-10-03T00:00:00+00:00',
            'input_sha256':fingerprints(tmp_path)}
    assert report_status(report,tmp_path,'2.1.0')['status']=='current'
    weather.write_text('ghi\n200')
    stale=report_status(report,tmp_path,'2.1.0')
    assert stale['status']=='stale' and stale['changed_files']==['data/weather_2025.csv']
    weather.write_text('ghi\n100')
    model.write_text('version=2')
    assert report_status(report,tmp_path,'2.1.0')['status']=='stale'
    assert report_status({},tmp_path,'2.1.0')['status']=='unverified'
    model.write_text('version=1')
    assert report_status(report,tmp_path,'2.2.0')['status']=='stale'
