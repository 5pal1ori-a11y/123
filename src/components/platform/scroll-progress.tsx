"use client";

import { useEffect, useState } from "react";

export function ScrollProgress() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    function update() {
      const el = document.documentElement;
      const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight || 1);
      setWidth(ratio * 100);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      className="scroll-progress fixed left-0 top-0 z-[60] h-[3px] transition-[width] duration-75"
      style={{ width: `${width}%` }}
      aria-hidden
    />
  );
}
