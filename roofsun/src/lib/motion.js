import { useEffect, useState } from "react";
export function useReducedMotion() {
  const [reduced, set] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => set(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  return reduced;
}
export function useReveal() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !("IntersectionObserver" in window)) return;
    const nodes = [
      ...document.querySelectorAll(".chapter,.how-it-works article"),
    ];
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove("reveal-pending");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    nodes.forEach((n) => {
      n.classList.add("reveal-pending");
      observer.observe(n);
    });
    return () => {
      observer.disconnect();
      nodes.forEach((n) => n.classList.remove("reveal-pending"));
    };
  }, [reduced]);
}
