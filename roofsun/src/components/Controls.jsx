import React, { useEffect, useRef, useState } from "react";
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100000,
  step = 1,
  unit,
}) {
  // Editing text may be empty or incomplete; only valid numbers reach the model.
  const [draft, setDraft] = useState(String(value));
  const published = useRef(value);
  useEffect(() => {
    if (value !== published.current) setDraft(String(value));
    published.current = value;
  }, [value]);
  const parse = (text) => {
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text.trim())) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  };
  const publish = (n) => {
    published.current = n;
    onChange(n);
  };
  const finish = () => {
    const n = parse(draft);
    const next = n === null ? value : Math.min(max, Math.max(min, n));
    setDraft(String(next));
    if (next !== value) publish(next);
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="text"
          inputMode={step < 1 ? "decimal" : "numeric"}
          value={draft}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") setDraft(String(value));
          }}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            const n = parse(text);
            if (n !== null && n >= min && n <= max) publish(n);
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}
