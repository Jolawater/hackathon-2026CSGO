export function coldFactor(data, temperature) {
  const rows=data.rows, base=rows.find(r=>r.temperature_c===23).energy_wh;
  if(!Number.isFinite(temperature)||temperature<rows[0].temperature_c||temperature>rows.at(-1).temperature_c) return null;
  const hi=rows.findIndex(r=>r.temperature_c>=temperature), b=rows[hi],a=rows[Math.max(0,hi-1)];
  const wh=a===b?b.energy_wh:a.energy_wh+(b.energy_wh-a.energy_wh)*(temperature-a.temperature_c)/(b.temperature_c-a.temperature_c);
  return Math.min(1,wh/base);
}
