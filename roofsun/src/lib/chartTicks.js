// Adapted from JESON-ROOFTOPJIM@51854cf niceTicks. Keep zero and integer ticks.
export function niceTicks(values) {
  const finite = values.filter(Number.isFinite);
  const lo = Math.min(0, ...finite),
    hi = Math.max(0, ...finite);
  const raw = (hi - lo) / 5 || 1000;
  const power = 10 ** Math.floor(Math.log10(raw)),
    normal = raw / power;
  const step = Math.max(
    1,
    (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * power,
  );
  const min = Math.floor(lo / step) * step,
    max = Math.max(min + step, Math.ceil(hi / step) * step);
  return Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, i) => min + i * step,
  );
}
