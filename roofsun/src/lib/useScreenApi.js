import { useEffect, useRef, useState } from "react";
// At most one expensive request per mounted screen. Later edits replace the
// queued payload; aborting fetch alone would not stop the backend calculation.
export function useScreenApi(path, body, delay = 450) {
  const key = path + "|" + JSON.stringify(body),
    inFlight = useRef(null);
  const [state, setState] = useState({ key: null, data: null, error: "" });
  useEffect(() => {
    let obsolete = false;
    const timer = setTimeout(async () => {
      if (inFlight.current) await inFlight.current;
      if (obsolete) return;
      const task = (async () => {
        try {
          const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await response.json();
          if (!response.ok) throw Error("Calculation failed");
          if (!obsolete) setState({ key, data, error: "" });
        } catch (e) {
          if (!obsolete) setState({ key, data: null, error: e.message });
        }
      })();
      inFlight.current = task;
      await task;
      if (inFlight.current === task) inFlight.current = null;
    }, delay);
    return () => {
      obsolete = true;
      clearTimeout(timer);
    };
  }, [key, delay]);
  return {
    data: state.data,
    loading: state.key !== key,
    error: state.key === key ? state.error : "",
  };
}
