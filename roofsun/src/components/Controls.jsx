import React, { useEffect, useRef, useState } from "react";
import { fmt } from "../lib/format.js";
export function NumericInput({
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  ...props
}) {
  const [text, setText] = useState(String(value ?? ""));
  const lastSent = useRef(value),
    skipBlur = useRef(false);
  useEffect(() => {
    if (value !== lastSent.current) setText(String(value ?? ""));
    lastSent.current = value;
  }, [value]);
  const valid = (raw) =>
    raw.trim() !== "" &&
    /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim()) &&
    Number.isFinite(Number(raw));
  function publish(n) {
    lastSent.current = n;
    onChange(n);
  }
  function finish() {
    if (skipBlur.current) {
      skipBlur.current = false;
      return;
    }
    if (!valid(text)) {
      setText(String(value ?? ""));
      return;
    }
    const n = Math.min(max, Math.max(min, Number(text)));
    setText(String(n));
    publish(n);
  }
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (valid(raw) && Number(raw) >= min && Number(raw) <= max)
          publish(Number(raw));
      }}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          skipBlur.current = true;
          setText(String(value ?? ""));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
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
        <NumericInput
          aria-label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
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
      <NumericInput
        className="slider-number"
        aria-label={`${label} ${unit} value`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
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
