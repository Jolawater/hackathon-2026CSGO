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
    target=page.locator('[data-key="target"]')
    slider=target.locator('..').locator('input[type="range"]')
    target.fill('94.5')
    assert float(slider.input_value())==94.5
    target.fill('90')
    slider.focus()
    slider.press('ArrowLeft')
    assert float(target.input_value())==89
    target.fill('90')
    assert page.locator('#tasks .value-slider').count()==9
    page.locator('#run').click()
    page.locator('table').wait_for()
    assert page.locator('.metric').count()>=8
    assert '够不够用' in page.locator('.result-explainer').inner_text()
    plot=page.locator('#socChart .interactive-chart')
    plot.hover(position={'x':200,'y':100})
    assert plot.locator('.chart-tooltip').is_visible()
    plot.focus()
    plot.press('Home')
    assert '00:00' in plot.locator('.chart-tooltip').inner_text()
    plot.press('End')
    assert '第2天' in plot.locator('.chart-tooltip').inner_text()
    assert plot.locator('.reference-line').count()==1
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
    page.locator('#referenceExperiment summary').click()
    page.locator('#runAging').click()
    page.locator('#ageCsv').wait_for(timeout=30000)
    assert 'Capacity retention' in page.locator('#ageOutput').inner_text()
    assert 'not charge level' in page.locator('#ageOutput .result-explainer').inner_text()
    health_plot=page.locator('#ageOutput .interactive-chart').first
    health_plot.hover(position={'x':150,'y':100})
    assert health_plot.locator('.chart-tooltip').is_visible()
    # Both plots created in one render must retain their interaction data.
    page.locator('#ageOutput .interactive-chart').last.hover(position={'x':150,'y':100})
    assert page.locator('#ageOutput .interactive-chart').last.locator('.chart-tooltip').is_visible()
    page.screenshot(path=str(OUT/'sandbox-desktop.png'),full_page=True)
    page.locator('[data-aging="temperature_c"]').fill('0')
    page.locator('#runAging').click()
    page.wait_for_function("document.querySelector('#ageOutput').textContent.includes('Outside supported')")
    page.locator('a[href="#compare"]').first.click()
    page.locator('#copyProfile').click()
    page.wait_for_function("document.querySelector('#profileNotice').textContent.length > 0")
    # Download and import scenario through the actual browser controls.
    page.locator('a[href="#compare"]').first.click()
    with page.expect_download() as d:
        page.locator('#export').click()
    exported=OUT/'scenario.json'
    d.value.save_as(str(exported))
    page.locator('#import').set_input_files(str(exported))
    page.wait_for_function("document.querySelector('#notice').textContent.includes('Imported')")
    page.locator('footer a[href="#evidence"]').click()
    page.locator('#checks table').wait_for(timeout=30000)
    assert 'Fail' not in page.locator('#checks tbody').inner_text()
    page.screenshot(path=str(OUT/'evidence-desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    page.locator('a[href="#compare"]').first.click()
    page.locator('#run').click()
    page.locator('#socChart .interactive-chart').wait_for()
    mobile_plot=page.locator('#socChart .interactive-chart')
    mobile_plot.click(position={'x':120,'y':100})
    assert mobile_plot.locator('.chart-tooltip').is_visible()
    mobile_plot.screenshot(path=str(OUT/'chart-mobile.png'))
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    assert not errors,errors
    report={'passed':True,'browser':'Microsoft Edge / Playwright','console_errors':errors,'checks':['3 device scenarios','winter inputs','bilingual UI','comparison table','independent aging access','supported aging','unsupported aging gate','profile transfer','JSON export/import','validation page','390px responsive layout','slider-number synchronization including decimals','keyboard slider changes','task timeline sliders','chart hover and keyboard inspection','reserve reference line','device and aging explanations','multiple aging-chart interactions']}
    (OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
    browser.close()
