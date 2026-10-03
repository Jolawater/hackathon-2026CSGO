import React, { useEffect, useState } from "react";
export default function CalculationWait({ t, requestKey }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    setSeconds(0);
    const id = setInterval(
      () => setSeconds(Math.floor((performance.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [requestKey]);
  return (
    <p className="calculation-wait" role="status">
      {t(
        `Simulating a full year hour by hour… ${seconds}s elapsed (typically 5–8s; first run may take longer).`,
        `正在逐小時模擬一整年…已 ${seconds} 秒（通常 5–8 秒，首次可能較久）。`,
      )}
    </p>
  );
}
