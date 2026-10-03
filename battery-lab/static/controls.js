// Keep the numeric input as the source of truth for API submission and imports.
// Slider bounds guide dragging; typing retains the full backend-supported range.
export function enhanceControls(root, device = 'phone') {
  const capacityMax = {phone: 40, scooter: 5000, car: 120000}[device];
  const powerMax = {phone: 100, scooter: 2000, car: 22000}[device];
  const rules = {
    cycles_per_day: [1,12,1],
    capacity_wh: [1, capacityMax, 1], charge_w: [0, powerMax, device === 'phone' ? 1 : 50],
    soh: [1, 100, 1], initial_soc: [0, 100, 1], reserve: [0, 99, 1],
    trigger: [0, 99, 1], target: [1, 100, 1], efficiency: [1, 100, 1],
    departure_min: [0, 100, 1], taper_soc: [1, 100, 1], taper_factor: [1, 100, 1],
    cold_capacity_factor: [1, 100, 1], fluctuation: [0, 50, 1],
    window_start: [0, 23.75, .25], window_end: [0, 23.75, .25], departure: [0, 23.75, .25],
    ambient_c: [-40, 60, 1], temperature_c: [-40, 80, 1],
    price: [0, 10, .05], days: [1, 365, 1], seed: [0, 1000, 1],
    distance_km: [0, device === 'car' ? 1000 : 200, 1], wh_km: [0, device === 'car' ? 500 : 100, 1],
    aux_w: [0, 5000, 10], heating_w: [0, device === 'car' ? 10000 : 1000, 10],
    lower_soc: [0, 100, 1], upper_soc: [0, 100, 1], charge_c: [.05, 3, .05], discharge_c: [.05, 3, .05],
  };
  root.querySelectorAll('input[type="number"]').forEach(input => {
    if (input.closest('.range-control')) return;
    let key = input.dataset.key || input.dataset.aging;
    let spec = rules[key] || [0, powerMax, 1];
    if (input.dataset.aging === 'days') spec = [1, 1095, 1];
    if (input.closest('.task')) {
      const index = [...input.parentElement.querySelectorAll('input[type="number"]')].indexOf(input);
      spec = index < 2 ? [0, index ? 24 : 23.75, .25] : [0, powerMax, device === 'phone' ? .1 : 10];
    }
    const wrap = document.createElement('span');
    wrap.className = 'range-control';
    const range = document.createElement('input');
    range.type = 'range'; range.className = 'value-slider';
    range.min = spec[0]; range.max = Math.max(spec[1], Number(input.value)); range.step = spec[2];
    const label = input.getAttribute('aria-label') || input.closest('label')?.textContent.trim() || key;
    input.setAttribute('aria-label', label);
    range.setAttribute('aria-label', label + (document.documentElement.lang.startsWith('zh') ? ' · 拖动调整' : ' · drag to adjust'));
    input.before(wrap); wrap.append(range, input);
    const sync = () => {
      if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
      range.max = Math.max(spec[1], input.valueAsNumber);
      range.min = Math.min(spec[0], input.valueAsNumber);
      const steps = (input.valueAsNumber - Number(range.min)) / spec[2];
      range.step = Math.abs(steps - Math.round(steps)) < 1e-8 ? spec[2] : 'any';
      range.value = input.value;
      range.style.setProperty('--fill', `${100 * (Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min) || 1)}%`);
      range.setAttribute('aria-valuetext', input.value);
    };
    input.addEventListener('input', sync);
    range.addEventListener('input', () => {
      input.value = Number((Math.round(Number(range.value) / spec[2]) * spec[2]).toFixed(6));
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    sync();
  });
}
