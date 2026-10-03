import React from "react";
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  unit,
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            if (e.target.value !== "") {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}
