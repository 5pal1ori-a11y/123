"use client";

import { useEffect, useState } from "react";

const WORDS = ["DOES", "자판기", "상점", "상품"];

export function LandingHeroWords() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById("hero");
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / (rect.height * 0.85)));
      const next = Math.min(WORDS.length - 1, Math.floor(progress * WORDS.length));
      setIndex(next);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <span className="relative inline-block min-w-[5ch] text-gradient" aria-live="polite">
      <span key={WORDS[index]} className="scroll-story-line inline-block">
        {WORDS[index]}
      </span>
    </span>
  );
}
