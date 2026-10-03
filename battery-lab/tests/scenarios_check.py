"""Browser acceptance of lifestyle presets, metadata and legacy imports."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

out=Path(__file__).resolve().parents[1]/'artifacts'
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1050})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8765')
    page.locator('[data-scenario="phone-student"]').wait_for()
    for device,ids in [('phone',['phone-student','phone-travel']),('scooter',['scooter-commute','scooter-delivery']),('car',['car-commute','car-winter'])]:
        page.locator(f'[data-device="{device}"]').click()
        assert page.locator('.scenario-card').count()==2
        assert page.locator('.scenario-card.selected').get_attribute('data-scenario')==ids[0]
        for id in ids:
            page.locator(f'[data-scenario="{id}"]').click()
            assert page.locator('#output .metric').count()==0
            page.locator('#run').click()
            page.wait_for_function("!document.querySelector('#run').disabled")
            assert page.locator('#output .metric').count()>0
            assert page.locator('#notice').inner_text()==''
    page.locator('[data-key="target"]').fill('85')
    assert '已自定义' in page.locator('#scenarioCards').inner_text()
    page.locator('#save').click()
    page.reload()
    page.locator('.scenario-card.selected').wait_for()
    assert page.locator('[data-key="target"]').input_value()=='85'
    assert page.locator('.scenario-card.selected').get_attribute('data-scenario')=='car-winter'
    page.locator('#lang').click()
    assert 'Customized' in page.locator('#scenarioCards').inner_text()
    assert page.locator('[data-key="target"]').input_value()=='85'
    with page.expect_download() as download:
        page.locator('#export').click()
    path=out/'scenario-with-metadata.json'
    download.value.save_as(str(path))
    data=json.loads(path.read_text())
    assert data['scenario_id']=='car-winter' and data['scenario_customized']
    page.locator('[data-scenario="car-commute"]').click()
    page.locator('#import').set_input_files(str(path))
    page.wait_for_function("document.querySelector('#notice').textContent.includes('Imported')")
    assert page.locator('.scenario-card.selected').get_attribute('data-scenario')=='car-winter'
    data.pop('scenario_id');data.pop('scenario_customized')
    legacy=out/'legacy-scenario.json';legacy.write_text(json.dumps(data))
    page.locator('#import').set_input_files(str(legacy))
    page.wait_for_function("document.querySelectorAll('.scenario-card.selected').length===0")
    assert 'Customized' in page.locator('#scenarioCards').inner_text()
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    page.locator('#scenarioCards').screenshot(path=str(out/'scenarios-mobile.png'))
    assert not errors,errors
    print('PASS: six presets, stale-result clearing, customization, save/reload, language, JSON roundtrip, legacy imports, mobile layout')
    browser.close()
