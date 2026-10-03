// Smooth sunlight; shading deliberately stays on the nearest backend sample.
export function sunFrame(path, frame) {
  if (!path?.length) return null;
  const value = Math.max(0, Math.min(path.length - 1, frame)),
    index = Math.floor(value),
    f = value - index;
  const a = path[index],
    b = path[Math.min(index + 1, path.length - 1)],
    nearest = path[Math.round(value)];
  const vector = (p) => {
    const alt = (p.altitude * Math.PI) / 180,
      az = (p.azimuth * Math.PI) / 180;
    return [
      Math.sin(az) * Math.cos(alt),
      Math.sin(alt),
      -Math.cos(az) * Math.cos(alt),
    ];
  };
  const va = vector(a),
    vb = vector(b),
    direction = va.map((v, i) => v * (1 - f) + vb[i] * f),
    length = Math.hypot(...direction);
  const normalized = direction.map((v) => v / length);
  return {
    ...nearest,
    sample_altitude: nearest.altitude,
    hour: a.hour * (1 - f) + b.hour * f,
    altitude: (Math.asin(normalized[1]) * 180) / Math.PI,
    azimuth:
      ((Math.atan2(normalized[0], -normalized[2]) * 180) / Math.PI + 360) % 360,
  };
}
export function sunTime(sun) {
  const minutes = Math.round((sun?.hour ?? 12) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
