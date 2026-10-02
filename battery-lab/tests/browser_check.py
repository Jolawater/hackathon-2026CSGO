"""Run against an already-running local server. Uses installed Edge on Windows."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts'
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1050},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8765')
    page.locator('[data-device="phone"]').wait_for()
    page.locator('#run').click()
    page.locator('table').wait_for()
    assert page.locator('.metric').count()>=8
    page.screenshot(path=str(OUT/'compare-desktop.png'),full_page=True)
    # All three devices, journeys, winter, bilingual UI.
    for device in ['scooter','car']:
        page.locator(f'[data-device="{device}"]').click()
        page.locator('#winter').click()
        page.locator('#applyTrip').click()
        page.locator('#run').click()
        page.locator('table').wait_for()
        assert page.locator('#notice').inner_text()==''
    page.locator('#lang').click()
    assert page.locator('h1').inner_text()=='Enough energy. For your kind of day.'
    page.locator('a[href="#sandbox"]').click()
    page.locator('#run').click()
    page.locator('#play').wait_for()
    page.locator('#reset').click()
    page.locator('#play').click()
    page.wait_for_timeout(300)
    page.locator('#play').click()
    assert float(page.locator('#scrub').input_value())>1
    page.locator('#runAging').click()
    page.locator('#ageCsv').wait_for(timeout=30000)
    assert 'Capacity retention' in page.locator('#ageOutput').inner_text()
    page.screenshot(path=str(OUT/'sandbox-desktop.png'),full_page=True)
    page.locator('[data-aging="temperature_c"]').fill('0')
    page.locator('#runAging').click()
    page.wait_for_function("document.querySelector('#ageOutput').textContent.includes('Outside supported')")
    page.locator('#copyProfile').click()
    page.wait_for_function("document.querySelector('#profileNotice').textContent.length > 0")
    # Download and import scenario through the actual browser controls.
    with page.expect_download() as d:
        page.locator('#export').click()
    exported=OUT/'scenario.json'
    d.value.save_as(str(exported))
    page.locator('#import').set_input_files(str(exported))
    page.wait_for_function("document.querySelector('#notice').textContent.includes('Imported')")
    page.locator('a[href="#evidence"]').click()
    page.locator('#checks table').wait_for(timeout=30000)
    assert 'Fail' not in page.locator('#checks tbody').inner_text()
    page.screenshot(path=str(OUT/'evidence-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('a[href="#sandbox"]').click()
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    assert not errors,errors
    report={'passed':True,'browser':'Microsoft Edge / Playwright','console_errors':errors,'checks':['3 device scenarios','winter inputs','bilingual UI','comparison table','playback','supported aging','unsupported aging gate','profile transfer','JSON export/import','validation page','390px responsive layout']}
    (OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
    browser.close()
