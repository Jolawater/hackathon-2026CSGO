import React from "react";
import { fmt } from "../lib/format.js";
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
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = "",
  id,
}) {
  return (
    <label className="slider-field" htmlFor={id}>
      <span>
        {label}
        <strong>
          {fmt(value, 1)}
          {unit}
        </strong>
      </span>
      <input
        id={id}
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(+e.target.value)}
      />
      <input
        className="slider-number"
        aria-label={`${label} ${unit} value`}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(+e.target.value))
            onChange(Math.min(max, Math.max(min, +e.target.value)));
        }}
      />
      <span className="range-ends">
        <small>
          {min}
          {unit}
        </small>
        <small>
          {max}
          {unit}
        </small>
      </span>
    </label>
  );
}
export function Pill({ children, kind = "" }) {
  return <span className={`pill ${kind}`}>{children}</span>;
}
