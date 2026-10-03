from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-swiftshader'])
    page=b.new_page(viewport={'width':1440,'height':1100})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/')
    page.locator('#compareRegion').select_option('hong_kong')
    page.locator('#compareMonth').select_option('1')
    page.locator('#applyRegion').click()
    assert float(page.locator('[data-key="ambient_c"]').input_value())==16
    page.locator('#run').click()
    page.wait_for_function("!document.querySelector('#run').disabled")
    assert not page.locator('#notice').inner_text()
    page.locator('#save').click()
    assert page.evaluate("JSON.parse(localStorage.getItem('bc-scenario')).climate_applied")
    page.reload()
    assert page.locator('#compareRegion').input_value()=='hong_kong'
    page.locator('[data-key="ambient_c"]').fill('10')
    page.locator('#save').click()
    assert not page.evaluate("JSON.parse(localStorage.getItem('bc-scenario')).climate_applied")
    page.locator('a[href="#sandbox"]').click()
    f=page.frame_locator('#workshopFrame');f.locator('#region').wait_for()
    f.locator('#monthNumber').fill('1')
    f.locator('#region').select_option('helsinki')
    f.locator('#applyClimate').click()
    assert float(f.locator('#outsideNumber').input_value())==-2.92
    frame=page.frames[1]
    assert frame.evaluate('__workshop.snapshot.config.ambient')==22
    f.locator('#place').select_option('outdoors')
    assert frame.evaluate('__workshop.snapshot.config.ambient')==-2.92
    f.locator('#monthNumber').fill('7')
    assert float(f.locator('#outsideNumber').input_value())==17.55
    f.locator('#monthNumber').fill('1')
    f.locator('#region').select_option('singapore')
    f.locator('#applyClimate').click()
    assert float(f.locator('#outsideNumber').input_value())==25.94
    assert f.locator('#season').is_disabled()
    assert frame.evaluate('__workshop.visualSeason')=='tropical'
    f.locator('#outsideNumber').fill('20')
    assert not frame.evaluate('__workshop.snapshot.config.climateApplied')
    f.locator('#monthNumber').fill('2')
    assert float(f.locator('#outsideNumber').input_value())==20
    page.set_viewport_size({'width':390,'height':844})
    assert frame.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    b.close()
print('Regional reference, monthly updates, manual override, indoor separation and persistence passed')
