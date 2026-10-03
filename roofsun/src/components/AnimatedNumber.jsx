import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../lib/motion.js";
export default function AnimatedNumber({ value, format }) {
  const reduced = useReducedMotion(),
    last = useRef(0),
    [shown, setShown] = useState(value ?? 0),
    [moving, setMoving] = useState(false);
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) {
      setMoving(false);
      return;
    }
    if (reduced) {
      last.current = value;
      setShown(value);
      setMoving(false);
      return;
    }
    const from = last.current,
      start = performance.now();
    let frame;
    setMoving(true);
    function tick(now) {
      const p = Math.min(1, (now - start) / 500),
        n = from + (value - from) * (1 - (1 - p) ** 3);
      last.current = n;
      setShown(p === 1 ? value : n);
      if (p < 1) frame = requestAnimationFrame(tick);
      else setMoving(false);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return (
    <span
      data-number-moving={
        !reduced && value != null && (moving || shown !== value)
      }
    >
      {value == null ? "—" : format(reduced ? value : shown)}
    </span>
  );
}
