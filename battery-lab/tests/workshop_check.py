"""3D rendering, deterministic timeline, interactions and bilingual mobile acceptance."""
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'artifacts'
with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-swiftshader'])
    page=b.new_page(viewport={'width':1440,'height':1100})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/#sandbox')
    f=page.frame_locator('#workshopFrame')
    f.locator('#connect').wait_for()
    frame=page.frames[1]
    frame.wait_for_function('window.__workshop?.webgl === true')
    assert not page.locator('#workspace').is_visible()
    assert page.locator('nav a').count()==2
    f.locator('#scene').scroll_into_view_if_needed()
    targets=frame.evaluate('__workshop.dragTargets')
    bounds=page.locator('#workshopFrame').bounding_box()
    start=targets['plug'];end=targets['port']
    page.mouse.move(bounds['x']+start[0],bounds['y']+start[1])
    page.mouse.down()
    page.mouse.move(bounds['x']+end[0],bounds['y']+end[1],steps=20)
    page.mouse.up()
    assert frame.evaluate('__workshop.snapshot.config.connected'), '3D plug drag must connect'
    f.locator('#step').click()
    assert frame.evaluate('__workshop.snapshot.energy')>5.25
    energy=frame.evaluate('__workshop.snapshot.energy')
    f.locator('#seek').fill('600')
    f.locator('#seek').fill('60')
    assert frame.evaluate('__workshop.snapshot.energy')==energy
    f.locator('#monthNumber').fill('1')
    assert f.locator('#season').input_value()=='winter'
    assert f.locator('#outsideNumber').input_value()=='18'
    f.locator('#outsideNumber').fill('5')
    f.locator('#visualStyle').select_option('studio')
    f.locator('#visualStyle').select_option('animated')
    f.locator('#place').select_option('outdoors')
    f.locator('#thermal').click()
    f.locator('#step').click()
    assert frame.evaluate('__workshop.thermal')
    assert frame.evaluate('__workshop.snapshot.config.ambient')==5
    assert abs(frame.evaluate('__workshop.final.balanceError'))<1e-8
    f.locator('#seek').fill('0')
    assert f.locator('#place').input_value()=='indoors'
    assert f.locator('#monthNumber').input_value()=='4'
    f.locator('#seek').fill('120')
    assert f.locator('#place').input_value()=='outdoors'
    assert f.locator('#monthNumber').input_value()=='1'
    page.screenshot(path=str(OUT/'workshop-desktop.png'),full_page=True)
    page.locator('#lang').click()
    assert f.locator('[data-i="title"]').inner_text()=='Your desk. A battery playground.'
    # Independent cell lab remains accessible and uses EFC as x-axis.
    page.locator('#referenceExperiment summary').click()
    page.locator('[data-aging="days"]').fill('30')
    page.locator('#runAging').click()
    page.locator('#ageCsv').wait_for(timeout=60000)
    assert 'equivalent full cycles' in page.locator('#ageOutput').inner_text()
    page.set_viewport_size({'width':390,'height':844})
    f.locator('#normal').click()
    page.screenshot(path=str(OUT/'workshop-mobile.png'),full_page=True)
    assert frame.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    f.locator('#lifeProfile').click()
    assert page.locator('#referenceExperiment').get_attribute('open') is not None
    page.locator('#runAging').click()
    page.wait_for_function("document.querySelector('#ageOutput').textContent.includes('Outside supported')")
    assert not errors,errors
    b.close()
print('Workshop browser acceptance passed')
