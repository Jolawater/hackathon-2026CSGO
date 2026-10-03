import { useEffect, useState } from "react";
export function useApi(path, body, delay = 200, enabled = true) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const serialized = JSON.stringify(body);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(path, {
          method: body === undefined ? "GET" : "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(
            Array.isArray(result.detail)
              ? result.detail.map((x) => x.msg).join("; ")
              : result.detail || "Calculation failed",
          );
        if (!controller.signal.aborted) {
          setData(result);
          setLoading(false);
        }
      } catch (e) {
        if (e.name !== "AbortError" && !controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, serialized, delay, enabled]);
  return { data, loading, error };
}
