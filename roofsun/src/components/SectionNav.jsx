import React, { useEffect, useState } from "react";
import { jumpTo } from "./Intro.jsx";
export default function SectionNav({ t }) {
  const [active, setActive] = useState("intro");
  const sections = [
    ["intro", "Intro", "介紹"],
    ["inputs", "Your roof", "填寫"],
    ["results", "Results", "結果"],
    ["cashflow", "Payback", "回本"],
    ["trust", "Evidence", "假設與證據"],
  ];
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      () => {
        const nodes = sections
          .map(([id]) => document.getElementById(id))
          .filter(Boolean);
        const reached = nodes.filter(
          (n) => n.getBoundingClientRect().top < innerHeight * 0.45,
        );
        setActive((reached.at(-1) || nodes[0]).id);
      },
      { rootMargin: "-90px 0px -45% 0px", threshold: [0, 0.1, 1] },
    );
    sections.forEach(([id]) => {
      const n = document.getElementById(id);
      if (n) observer.observe(n);
    });
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <nav className="section-nav" aria-label={t("Page sections", "頁面章節")}>
        {sections.map(([id, en, cn]) => (
          <a
            key={id}
            href={"#" + id}
            aria-current={active === id ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              jumpTo(id, id === "inputs");
            }}
          >
            {t(en, cn)}
          </a>
        ))}
      </nav>
      <button className="mobile-start" onClick={() => jumpTo("inputs", true)}>
        {t("Start", "開始")}
      </button>
    </>
  );
}
