import React, { useEffect, useRef, useState } from "react";
export default function DeferredScene({ children, t }) {
  const ref = useRef(null),
    [near, setNear] = useState(false);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="deferred-scene">
      {near ? (
        children
      ) : (
        <div className="scene-empty">
          {t(
            "The interactive rooftop loads when you reach this section.",
            "滑到這一節時，才載入互動天台。",
          )}
        </div>
      )}
    </div>
  );
}
